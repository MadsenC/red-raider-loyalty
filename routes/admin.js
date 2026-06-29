const router = require('express').Router();
const db     = require('../database/db');
const { requireAdmin } = require('../middleware/auth');

router.use(requireAdmin);

const NOW = () => new Date().toISOString();

/* ── GET /api/admin/events ── */
router.get('/events', (req, res) => {
  const events = db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM reservations r WHERE r.event_id=e.id AND r.status NOT IN ('dropped')) AS reservationCount,
      (SELECT COUNT(*) FROM reservations r WHERE r.event_id=e.id AND r.status='claimed') AS claimCount,
      (SELECT COUNT(*) FROM no_show_flags n WHERE n.event_id=e.id AND n.dispute_status='pending') AS pendingFlags
    FROM events e ORDER BY e.game_datetime ASC
  `).all();
  res.json(events);
});

/* ── POST /api/admin/events ── */
router.post('/events', (req, res) => {
  const {
    name, sport, game_datetime, high_impact, mode, capacity,
    ticket_office_allotment, attendance_points,
    reservation_opens, reservation_closes, claim_opens, claim_closes,
    waitlist_cascade, open_claim_start, drop_closes,
  } = req.body;

  const r = db.prepare(`
    INSERT INTO events(name,sport,game_datetime,high_impact,mode,capacity,ticket_office_allotment,
      attendance_points,status,reservation_opens,reservation_closes,claim_opens,claim_closes,
      waitlist_cascade,open_claim_start,drop_closes)
    VALUES(?,?,?,?,?,?,?,?,'scheduled',?,?,?,?,?,?,?)
  `).run(name, sport, game_datetime, high_impact?1:0, mode, capacity,
     ticket_office_allotment||0, attendance_points||100,
     reservation_opens||null, reservation_closes||null,
     claim_opens||null, claim_closes||null,
     waitlist_cascade||null, open_claim_start||null, drop_closes||null);

  res.json({ ok: true, id: r.lastInsertRowid });
});

/* ── PUT /api/admin/events/:id ── */
router.put('/events/:id', (req, res) => {
  const fields = req.body;
  const allowed = ['name','sport','game_datetime','high_impact','mode','capacity',
    'ticket_office_allotment','attendance_points','status',
    'reservation_opens','reservation_closes','claim_opens','claim_closes',
    'waitlist_cascade','open_claim_start','drop_closes'];
  const sets = allowed.filter(k => k in fields).map(k => `${k}=?`).join(',');
  const vals = allowed.filter(k => k in fields).map(k => fields[k]);
  if (!sets) return res.status(400).json({ error: 'No valid fields provided.' });
  db.prepare(`UPDATE events SET ${sets} WHERE id=?`).run(...vals, req.params.id);
  res.json({ ok: true });
});

/* ── GET /api/admin/events/:id/dashboard ── */
router.get('/events/:id/dashboard', (req, res) => {
  const eid = req.params.id;
  const event = db.prepare('SELECT * FROM events WHERE id=?').get(eid);
  if (!event) return res.status(404).json({ error: 'Not found.' });

  const reservationCount = db.prepare(`SELECT COUNT(*) AS n FROM reservations WHERE event_id=? AND status NOT IN ('dropped')`).get(eid).n;
  const claimCount       = db.prepare(`SELECT COUNT(*) AS n FROM reservations WHERE event_id=? AND status='claimed'`).get(eid).n;
  const confirmedCount   = db.prepare(`SELECT COUNT(*) AS n FROM reservations WHERE event_id=? AND status IN ('selected','confirmed','claimed')`).get(eid).n;
  const pendingFlags     = db.prepare(`SELECT COUNT(*) AS n FROM no_show_flags WHERE event_id=? AND dispute_status='pending'`).get(eid).n;
  const showRate         = reservationCount > 0 ? Math.round((claimCount / reservationCount) * 100) : 0;
  const capacityUsed     = event.capacity > 0 ? Math.round((confirmedCount / event.capacity) * 100) : 0;

  res.json({ event, reservationCount, claimCount, confirmedCount, pendingFlags, showRate, capacityUsed });
});

/* ── POST /api/admin/events/:id/run-selection ──
   Weighted selection:
   - Sort all reserved students by season_points DESC
   - Students strictly above capacity cutline → 'confirmed'
   - Students at the cutline (tie) → weighted random (points as weights)
   - Remaining → 'waitlisted'
*/
router.post('/events/:id/run-selection', (req, res) => {
  const eid = Number(req.params.id);
  const event = db.prepare('SELECT * FROM events WHERE id=?').get(eid);
  if (!event) return res.status(404).json({ error: 'Not found.' });

  const capacity = event.capacity - (event.ticket_office_allotment || 0);
  const now = NOW();

  const candidates = db.prepare(`
    SELECT r.id AS resId, u.season_points AS pts
    FROM reservations r
    JOIN users u ON u.id = r.user_id
    WHERE r.event_id=? AND r.status='reserved'
    ORDER BY u.season_points DESC, r.reserved_at ASC
  `).all(eid);

  if (candidates.length === 0)
    return res.json({ ok: true, confirmed: 0, waitlisted: 0, message: 'No reservations to process.' });

  let confirmed = 0, waitlisted = 0;

  if (candidates.length <= capacity) {
    /* Everyone fits — all confirmed */
    const ids = candidates.map(c => c.resId);
    db.prepare(`UPDATE reservations SET status='confirmed', selected_at=? WHERE id IN (${ids.map(()=>'?').join(',')})`)
      .run(now, ...ids);
    confirmed = ids.length;
  } else {
    /* Find the cutline point value */
    const cutlinePts = candidates[capacity - 1].pts;

    const aboveCut  = candidates.filter(c => c.pts > cutlinePts);
    const atCut     = candidates.filter(c => c.pts === cutlinePts);
    const belowCut  = candidates.filter(c => c.pts < cutlinePts);

    /* Above cutline → all confirmed */
    if (aboveCut.length > 0) {
      const ids = aboveCut.map(c => c.resId);
      db.prepare(`UPDATE reservations SET status='confirmed', selected_at=? WHERE id IN (${ids.map(()=>'?').join(',')})`)
        .run(now, ...ids);
      confirmed += ids.length;
    }

    /* At cutline → weighted lottery for remaining spots */
    const spotsLeft = capacity - aboveCut.length;
    if (spotsLeft > 0 && atCut.length > 0) {
      /* Simple weighted shuffle (equal weight since same points, so random is fine) */
      const shuffled = [...atCut].sort(() => Math.random() - 0.5);
      const winners  = shuffled.slice(0, spotsLeft);
      const losers   = shuffled.slice(spotsLeft);

      if (winners.length > 0) {
        const ids = winners.map(c => c.resId);
        db.prepare(`UPDATE reservations SET status='selected', selected_at=? WHERE id IN (${ids.map(()=>'?').join(',')})`)
          .run(now, ...ids);
        confirmed += ids.length;
      }
      if (losers.length > 0) {
        const ids = losers.map(c => c.resId);
        db.prepare(`UPDATE reservations SET status='waitlisted' WHERE id IN (${ids.map(()=>'?').join(',')})`)
          .run(...ids);
        waitlisted += ids.length;
      }
    }

    /* Below cutline → waitlisted */
    if (belowCut.length > 0) {
      const ids = belowCut.map(c => c.resId);
      db.prepare(`UPDATE reservations SET status='waitlisted' WHERE id IN (${ids.map(()=>'?').join(',')})`)
        .run(...ids);
      waitlisted += ids.length;
    }
  }

  db.prepare(`UPDATE events SET status='selection_complete' WHERE id=?`).run(eid);

  res.json({ ok: true, confirmed, waitlisted, message: `Selection complete. ${confirmed} confirmed, ${waitlisted} waitlisted.` });
});

/* ── POST /api/admin/events/:id/noshow-sweep ── */
router.post('/events/:id/noshow-sweep', (req, res) => {
  const eid   = Number(req.params.id);
  const event = db.prepare('SELECT * FROM events WHERE id=?').get(eid);
  if (!event) return res.status(404).json({ error: 'Not found.' });

  const now = NOW();
  if (now <= event.game_datetime)
    return res.status(400).json({ error: 'Game has not occurred yet.' });

  /* Find students who claimed but did not check in */
  const noShows = db.prepare(`
    SELECT r.user_id, r.event_id
    FROM reservations r
    WHERE r.event_id=? AND r.status='claimed'
      AND r.user_id NOT IN (SELECT ci.user_id FROM checkins ci WHERE ci.event_id=?)
  `).all(eid, eid);

  const penalty = event.high_impact
    ? Number(db.prepare(`SELECT value FROM config WHERE key='penalty_high_impact'`).get().value)
    : Number(db.prepare(`SELECT value FROM config WHERE key='penalty_standard'`).get().value);

  let flagged = 0;
  for (const ns of noShows) {
    /* Upsert flag */
    const existing = db.prepare('SELECT id FROM no_show_flags WHERE user_id=? AND event_id=?').get(ns.user_id, ns.event_id);
    if (!existing) {
      db.prepare(`INSERT INTO no_show_flags(user_id,event_id,penalty_points,created_at) VALUES(?,?,?,?)`)
        .run(ns.user_id, ns.event_id, penalty, now);
      flagged++;
    }
  }

  res.json({ ok: true, flagged, message: `Sweep complete. ${flagged} students flagged.` });
});

/* ── GET /api/admin/students ── */
router.get('/students', (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : '%';
  const students = db.prepare(`
    SELECT id,name,erider,r_number,class,fee_paid,role,season_points,lifetime_points,
      (SELECT COUNT(*) FROM no_show_flags n WHERE n.user_id=users.id AND n.dispute_status!='cleared') AS noShows
    FROM users
    WHERE role='student' AND (name LIKE ? OR erider LIKE ? OR r_number LIKE ?)
    ORDER BY season_points DESC
  `).all(q, q, q);
  res.json(students);
});

/* ── GET /api/admin/disputes ── */
router.get('/disputes', (req, res) => {
  const status = req.query.status || 'pending';
  const disputes = db.prepare(`
    SELECT ns.*,
      u.name AS studentName, u.erider, u.r_number,
      e.name AS eventName, e.game_datetime
    FROM no_show_flags ns
    JOIN users  u ON u.id  = ns.user_id
    JOIN events e ON e.id  = ns.event_id
    WHERE ns.dispute_status = ?
    ORDER BY ns.created_at DESC
  `).all(status);
  res.json(disputes);
});

/* ── POST /api/admin/disputes/:id/clear ── */
router.post('/disputes/:id/clear', (req, res) => {
  const flag = db.prepare('SELECT * FROM no_show_flags WHERE id=?').get(req.params.id);
  if (!flag) return res.status(404).json({ error: 'Not found.' });

  db.prepare(`UPDATE no_show_flags SET dispute_status='cleared' WHERE id=?`).run(req.params.id);
  /* Reverse any penalty that was applied via points_history */
  const ph = db.prepare(`
    SELECT * FROM points_history WHERE user_id=? AND event_id=? AND type='penalty'
  `).get(flag.user_id, flag.event_id);
  if (ph) {
    db.prepare('UPDATE users SET season_points=season_points+?, lifetime_points=lifetime_points+? WHERE id=?')
      .run(flag.penalty_points, flag.penalty_points, flag.user_id);
    db.prepare('DELETE FROM points_history WHERE id=?').run(ph.id);
  }
  res.json({ ok: true });
});

/* ── POST /api/admin/disputes/:id/uphold ── */
router.post('/disputes/:id/uphold', (req, res) => {
  const flag = db.prepare('SELECT * FROM no_show_flags WHERE id=?').get(req.params.id);
  if (!flag) return res.status(404).json({ error: 'Not found.' });

  db.prepare(`UPDATE no_show_flags SET dispute_status='upheld' WHERE id=?`).run(req.params.id);

  /* Apply penalty if not already applied */
  const already = db.prepare(`SELECT id FROM points_history WHERE user_id=? AND event_id=? AND type='penalty'`)
    .get(flag.user_id, flag.event_id);
  if (!already) {
    const now = NOW();
    db.prepare(`INSERT INTO points_history(user_id,event_id,amount,type,description,created_at) VALUES(?,?,?,?,?,?)`)
      .run(flag.user_id, flag.event_id, -flag.penalty_points, 'penalty', 'No-show penalty upheld', now);
    db.prepare('UPDATE users SET season_points=MAX(0,season_points-?), lifetime_points=MAX(0,lifetime_points-?) WHERE id=?')
      .run(flag.penalty_points, flag.penalty_points, flag.user_id);
  }
  res.json({ ok: true });
});

/* ── POST /api/admin/checkin ── */
router.post('/checkin', (req, res) => {
  const { rNumber, eventId } = req.body;
  if (!rNumber || !eventId) return res.status(400).json({ error: 'rNumber and eventId required.' });

  const user  = db.prepare('SELECT * FROM users WHERE r_number=?').get(rNumber.toUpperCase().trim());
  if (!user)  return res.json({ success: false, reason: 'Student not found.' });
  if (!user.fee_paid) return res.json({ success: false, reason: 'Athletic fee not on file.' });

  const event = db.prepare('SELECT * FROM events WHERE id=?').get(eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const res_ = db.prepare('SELECT * FROM reservations WHERE user_id=? AND event_id=?').get(user.id, eventId);
  if (event.mode === 'reservation_required') {
    if (!res_ || !['selected','confirmed','claimed'].includes(res_.status)) {
      return res.json({ success: false, reason: 'No confirmed claim. Direct to waitlist area.', student: user.name });
    }
  }

  /* Check for duplicate scan */
  const already = db.prepare('SELECT id FROM checkins WHERE user_id=? AND event_id=?').get(user.id, eventId);
  if (already) return res.json({ success: true, alreadyScanned: true, student: user.name, pointsAwarded: 0 });

  const pts = event.attendance_points;
  const now = NOW();
  db.prepare('INSERT INTO checkins(user_id,event_id,scanned_at,points_awarded) VALUES(?,?,?,?)').run(user.id, eventId, now, pts);
  db.prepare('UPDATE users SET season_points=season_points+?, lifetime_points=lifetime_points+? WHERE id=?').run(pts, pts, user.id);
  db.prepare(`INSERT INTO points_history(user_id,event_id,amount,type,description,created_at) VALUES(?,?,?,?,?,?)`)
    .run(user.id, eventId, pts, 'attendance', event.name, now);

  /* Update reservation status */
  if (res_) db.prepare(`UPDATE reservations SET status='claimed' WHERE user_id=? AND event_id=?`).run(user.id, eventId);

  res.json({ success: true, student: user.name, rNumber: user.r_number, pointsAwarded: pts,
    newTotal: user.season_points + pts });
});

/* ── GET /api/admin/rewards ── */
router.get('/rewards', (req, res) => {
  res.json(db.prepare('SELECT * FROM rewards ORDER BY points_cost ASC').all());
});

/* ── POST /api/admin/rewards ── */
router.post('/rewards', (req, res) => {
  const { name, category, points_cost, active } = req.body;
  const r = db.prepare('INSERT INTO rewards(name,category,points_cost,active) VALUES(?,?,?,?)')
    .run(name, category, points_cost, active ? 1 : 0);
  res.json({ ok: true, id: r.lastInsertRowid });
});

/* ── PUT /api/admin/rewards/:id ── */
router.put('/rewards/:id', (req, res) => {
  const { name, category, points_cost, active } = req.body;
  db.prepare('UPDATE rewards SET name=?,category=?,points_cost=?,active=? WHERE id=?')
    .run(name, category, points_cost, active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

/* ── GET /api/admin/config ── */
router.get('/config', (req, res) => {
  const rows = db.prepare('SELECT * FROM config').all();
  const cfg  = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json(cfg);
});

/* ── PUT /api/admin/config ── */
router.put('/config', (req, res) => {
  const upsert = db.prepare('INSERT OR REPLACE INTO config(key,value) VALUES(?,?)');
  for (const [k, v] of Object.entries(req.body)) upsert.run(k, String(v));
  res.json({ ok: true });
});

module.exports = router;
