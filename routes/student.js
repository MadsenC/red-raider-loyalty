const router = require('express').Router();
const db     = require('../database/db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

const NOW = () => new Date().toISOString();

/* ── GET /api/student/events ── */
router.get('/events', (req, res) => {
  const uid = req.session.userId;

  const events = db.prepare(`
    SELECT e.*,
      r.status     AS userStatus,
      r.id         AS reservationId,
      r.claimed_at AS claimedAt,
      ci.id        AS checkinId
    FROM events e
    LEFT JOIN reservations r  ON r.event_id = e.id AND r.user_id = ?
    LEFT JOIN checkins     ci ON ci.event_id = e.id AND ci.user_id = ?
    WHERE e.status != 'cancelled'
    ORDER BY e.game_datetime ASC
  `).all(uid, uid);

  const now = NOW();

  const result = events.map(ev => {
    const windowStatus = getWindowStatus(ev, now);
    return {
      id:               ev.id,
      name:             ev.name,
      sport:            ev.sport,
      datetime:         ev.game_datetime,
      highImpact:       !!ev.high_impact,
      mode:             ev.mode,
      capacity:         ev.capacity,
      attendancePoints: ev.attendance_points,
      status:           ev.status,
      userStatus:       ev.userStatus || null,
      checkedIn:        !!ev.checkinId,
      windowStatus,
      windows: {
        reservationOpens:  ev.reservation_opens,
        reservationCloses: ev.reservation_closes,
        claimOpens:        ev.claim_opens,
        claimCloses:       ev.claim_closes,
        dropCloses:        ev.drop_closes,
        openClaimStart:    ev.open_claim_start,
      },
    };
  });

  res.json(result);
});

/* ── POST /api/student/reserve/:eventId ── */
router.post('/reserve/:eventId', (req, res) => {
  const uid = req.session.userId;
  const eid = Number(req.params.eventId);
  const now = NOW();

  const event = db.prepare('SELECT * FROM events WHERE id=?').get(eid);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  if (event.mode !== 'reservation_required')
    return res.status(400).json({ error: 'This event does not require a reservation.' });
  if (now < event.reservation_opens || now > event.reservation_closes)
    return res.status(400).json({ error: 'Reservation window is not currently open.' });

  const existing = db.prepare('SELECT * FROM reservations WHERE user_id=? AND event_id=?').get(uid, eid);
  if (existing) return res.status(409).json({ error: 'Already reserved for this event.' });

  db.prepare(`INSERT INTO reservations(user_id,event_id,status,reserved_at) VALUES(?,?,'reserved',?)`).run(uid, eid, now);
  res.json({ ok: true, message: 'Reserved. You will be notified when the claim window opens.' });
});

/* ── POST /api/student/claim/:eventId ── */
router.post('/claim/:eventId', (req, res) => {
  const uid = req.session.userId;
  const eid = Number(req.params.eventId);
  const now = NOW();

  const event = db.prepare('SELECT * FROM events WHERE id=?').get(eid);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const reservation = db.prepare('SELECT * FROM reservations WHERE user_id=? AND event_id=?').get(uid, eid);
  if (!reservation) return res.status(400).json({ error: 'No reservation found for this event.' });
  if (!['selected','confirmed'].includes(reservation.status))
    return res.status(400).json({ error: 'You have not been selected for this event.' });
  if (reservation.status === 'claimed')
    return res.status(409).json({ error: 'Already claimed.' });

  /* Check claim window — allow during claim, waitlist cascade, and open claim windows */
  const inClaim      = event.claim_opens   && now >= event.claim_opens  && now <= event.claim_closes;
  const inOpenClaim  = event.open_claim_start && now >= event.open_claim_start;
  if (!inClaim && !inOpenClaim)
    return res.status(400).json({ error: 'Claim window is not currently open.' });
  if (event.drop_closes && now > event.drop_closes)
    return res.status(400).json({ error: 'Claim window has closed for this event.' });

  db.prepare(`UPDATE reservations SET status='claimed', claimed_at=? WHERE user_id=? AND event_id=?`)
    .run(now, uid, eid);

  res.json({ ok: true, message: 'Spot claimed. Show your physical student ID at the gate.' });
});

/* ── POST /api/student/drop/:eventId ── */
router.post('/drop/:eventId', (req, res) => {
  const uid = req.session.userId;
  const eid = Number(req.params.eventId);
  const now = NOW();

  const event = db.prepare('SELECT * FROM events WHERE id=?').get(eid);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const reservation = db.prepare('SELECT * FROM reservations WHERE user_id=? AND event_id=?').get(uid, eid);
  if (!reservation || !['selected','confirmed','claimed'].includes(reservation.status))
    return res.status(400).json({ error: 'No active claim to drop.' });

  if (event.drop_closes && now > event.drop_closes)
    return res.status(400).json({ error: 'Drop window has closed. Contact studentloyalty@ttu.edu.' });

  db.prepare(`UPDATE reservations SET status='dropped', dropped_at=? WHERE user_id=? AND event_id=?`)
    .run(now, uid, eid);

  /* Promote first waitlisted student if one exists (simple cascade) */
  const next = db.prepare(`
    SELECT r.* FROM reservations r
    JOIN users u ON u.id = r.user_id
    WHERE r.event_id=? AND r.status='waitlisted'
    ORDER BY u.season_points DESC LIMIT 1
  `).get(eid);
  if (next) {
    db.prepare(`UPDATE reservations SET status='selected', selected_at=? WHERE id=?`).run(now, next.id);
  }

  res.json({ ok: true, message: 'Spot dropped. A waitlisted Raider has been notified.' });
});

/* ── GET /api/student/activity ── */
router.get('/activity', (req, res) => {
  const uid = req.session.userId;

  const history = db.prepare(`
    SELECT ph.*, e.name AS eventName, e.sport
    FROM points_history ph
    LEFT JOIN events e ON e.id = ph.event_id
    WHERE ph.user_id = ?
    ORDER BY ph.created_at DESC
    LIMIT 50
  `).all(uid);

  const stats = db.prepare(`
    SELECT
      COUNT(DISTINCT ci.event_id)  AS eventsAttended,
      COUNT(DISTINCT ns.id)        AS noShows
    FROM users u
    LEFT JOIN checkins      ci ON ci.user_id = u.id
    LEFT JOIN no_show_flags ns ON ns.user_id = u.id AND ns.dispute_status != 'cleared'
    WHERE u.id = ?
  `).get(uid);

  res.json({ history, stats });
});

/* ── GET /api/student/rewards ── */
router.get('/rewards', (req, res) => {
  const uid  = req.session.userId;
  const user = db.prepare('SELECT season_points FROM users WHERE id=?').get(uid);
  const catalog = db.prepare('SELECT * FROM rewards WHERE active=1 ORDER BY points_cost ASC').all();
  res.json({ points: user.season_points, catalog });
});

/* ── POST /api/student/redeem/:rewardId ── */
router.post('/redeem/:rewardId', (req, res) => {
  const uid = req.session.userId;
  const rid = Number(req.params.rewardId);

  const reward = db.prepare('SELECT * FROM rewards WHERE id=? AND active=1').get(rid);
  if (!reward) return res.status(404).json({ error: 'Reward not found.' });

  const user = db.prepare('SELECT season_points FROM users WHERE id=?').get(uid);
  if (user.season_points < reward.points_cost)
    return res.status(400).json({ error: `Not enough points. Need ${reward.points_cost - user.season_points} more.` });

  const now = NOW();
  db.prepare('INSERT INTO redemptions(user_id,reward_id,redeemed_at) VALUES(?,?,?)').run(uid, rid, now);
  db.prepare('UPDATE users SET season_points=season_points-?, lifetime_points=lifetime_points-? WHERE id=?')
    .run(reward.points_cost, reward.points_cost, uid);
  db.prepare(`INSERT INTO points_history(user_id,reward_id,amount,type,description,created_at)
              VALUES(?,?,?,?,?,?)`).run(uid, rid, -reward.points_cost, 'redemption', `Redeemed: ${reward.name}`, now);

  res.json({ ok: true, message: `Redeemed "${reward.name}". Check with athletics staff to collect.` });
});

/* ── Helpers ── */
function getWindowStatus(ev, now) {
  if (ev.mode === 'open') return 'open';
  if (!ev.reservation_opens) return 'no_windows';
  if (now < ev.reservation_opens)  return 'pre_reservation';
  if (now <= ev.reservation_closes) return 'reservation_open';
  if (now < ev.claim_opens)         return 'pre_claim';
  if (now <= ev.claim_closes)       return 'claim_open';
  if (ev.waitlist_cascade && now >= ev.waitlist_cascade && now < ev.open_claim_start) return 'waitlist_cascade';
  if (ev.open_claim_start && now >= ev.open_claim_start) {
    if (!ev.drop_closes || now <= ev.drop_closes) return 'open_claim';
  }
  if (ev.drop_closes && now > ev.drop_closes) return 'locked';
  return 'closed';
}

module.exports = router;
