import { Hono } from 'hono';
import { cors } from 'hono/cors';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

const app = new Hono();

/* ── CORS ── */
app.use('/api/*', cors({
  origin: ['https://madsenc.github.io', 'http://localhost:3000', 'http://localhost:8787', 'http://127.0.0.1:3000'],
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: false,
}));

/* ── JWT helpers ── */
function jwtSecret(env) {
  return new TextEncoder().encode(env.JWT_SECRET || 'rr-loyalty-dev-secret-change-in-prod');
}
async function signToken(payload, env) {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('7d').sign(jwtSecret(env));
}
async function verifyToken(token, env) {
  try { const { payload } = await jwtVerify(token, jwtSecret(env)); return payload; }
  catch { return null; }
}
function getToken(c) {
  const auth = c.req.header('Authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}
async function requireAuth(c, env, adminOnly = false) {
  const payload = await verifyToken(getToken(c), env);
  if (!payload) return null;
  if (adminOnly && payload.role !== 'admin') return null;
  return payload;
}

const NOW = () => new Date().toISOString();

/* ── D1 helpers ── */
const db = {
  first: (env, sql, ...args) => env.DB.prepare(sql).bind(...args).first(),
  all:   async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results,
  run:   (env, sql, ...args) => env.DB.prepare(sql).bind(...args).run(),
};

/* ── Point values by tier + sport_category ── */
function getEventPoints(ev) {
  const cat  = ev.sport_category || 'other';
  const tier = String(ev.tier || '2');
  if (cat === 'football_mbb') {
    const attend  = tier === '1' ? 5 : tier === '2' ? 10 : tier === '3' ? 15 : 0;
    const penalty = tier === '1' ? 20 : tier === '2' ? 15 : tier === '3' ? 10 : 15;
    return { attendPoints: attend, claimBonus: 0, noshowPenalty: penalty };
  }
  const attend  = tier === '1' ? 25 : tier === '2' ? 20 : 15;
  return { attendPoints: attend, claimBonus: 5, noshowPenalty: 5 };
}

/* ── Window status ── */
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

/* Auto-compute event status (only manual override is 'cancelled') */
function computeStatus(ev, now) {
  if (ev.status === 'cancelled') return 'cancelled';
  if (now > ev.game_datetime)    return 'past';
  if (ev.draw_run)               return 'selection_complete';
  return 'scheduled';
}

/* ─── Shared selection logic (used by manual + cron) ─── */
async function runSelectionForEvent(env, eid) {
  const event    = await db.first(env, 'SELECT * FROM events WHERE id=?', eid);
  if (!event) return null;
  const capacity = event.capacity - (event.ticket_office_allotment || 0);
  const now      = NOW();

  const candidates = await db.all(env, `
    SELECT r.id AS resId, u.season_points AS pts
    FROM reservations r JOIN users u ON u.id=r.user_id
    WHERE r.event_id=? AND r.status='reserved'
    ORDER BY u.season_points DESC, r.reserved_at ASC
  `, eid);

  if (!candidates.length) return { confirmed: 0, waitlisted: 0 };

  let confirmed = 0, waitlisted = 0;

  const batchUpdate = async (ids, status, extra = {}) => {
    for (const id of ids) {
      if (extra.selected_at) await db.run(env, `UPDATE reservations SET status=?,selected_at=? WHERE id=?`, status, extra.selected_at, id);
      else                   await db.run(env, `UPDATE reservations SET status=? WHERE id=?`, status, id);
    }
  };

  if (candidates.length <= capacity) {
    await batchUpdate(candidates.map(c => c.resId), 'confirmed', { selected_at: now });
    confirmed = candidates.length;
  } else {
    const cutlinePts = candidates[capacity - 1].pts;
    const aboveCut   = candidates.filter(c => c.pts > cutlinePts);
    const atCut      = candidates.filter(c => c.pts === cutlinePts);
    const belowCut   = candidates.filter(c => c.pts < cutlinePts);

    await batchUpdate(aboveCut.map(c => c.resId), 'confirmed', { selected_at: now });
    confirmed += aboveCut.length;

    const spotsLeft = capacity - aboveCut.length;
    if (spotsLeft > 0 && atCut.length > 0) {
      const shuffled = [...atCut].sort(() => Math.random() - 0.5);
      await batchUpdate(shuffled.slice(0, spotsLeft).map(c => c.resId), 'selected', { selected_at: now });
      await batchUpdate(shuffled.slice(spotsLeft).map(c => c.resId), 'waitlisted');
      confirmed  += Math.min(spotsLeft, atCut.length);
      waitlisted += Math.max(0, atCut.length - spotsLeft);
    }
    await batchUpdate(belowCut.map(c => c.resId), 'waitlisted');
    waitlisted += belowCut.length;
  }

  await db.run(env, `UPDATE events SET draw_run=1 WHERE id=?`, eid);
  return { confirmed, waitlisted };
}

/* ════════════════════════════════════════
   AUTH
════════════════════════════════════════ */

app.post('/api/auth/login', async (c) => {
  const { erider, password } = await c.req.json();
  if (!erider || !password) return c.json({ error: 'eRaider and password are required.' }, 400);
  const user = await db.first(c.env, 'SELECT * FROM users WHERE erider=?', erider.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return c.json({ error: 'Invalid eRaider or password.' }, 401);
  if (!user.fee_paid)
    return c.json({ error: 'fee_required', redirect: '/athleticfee.html' }, 403);
  const token = await signToken({ sub: String(user.id), erider: user.erider, name: user.name, role: user.role }, c.env);
  return c.json({ token, id: user.id, name: user.name, erider: user.erider, class: user.class, role: user.role, feePaid: !!user.fee_paid });
});

app.post('/api/auth/logout', (c) => c.json({ ok: true }));

app.get('/api/auth/me', async (c) => {
  const payload = await requireAuth(c, c.env);
  if (!payload) return c.json({ error: 'Not authenticated' }, 401);
  const user = await db.first(c.env,
    'SELECT id,name,erider,class,fee_paid,role,season_points,lifetime_points FROM users WHERE id=?', payload.sub);
  if (!user) return c.json({ error: 'User not found' }, 401);
  const rankRow  = await db.first(c.env, 'SELECT COUNT(*)+1 AS rank FROM users WHERE season_points>? AND role="student"', user.season_points);
  const totalRow = await db.first(c.env, 'SELECT COUNT(*) AS n FROM users WHERE role="student"');
  return c.json({
    id: user.id, name: user.name, erider: user.erider, class: user.class,
    feePaid: !!user.fee_paid, role: user.role,
    seasonPoints: user.season_points, lifetimePoints: user.lifetime_points,
    rank: rankRow.rank, totalStudents: totalRow.n,
  });
});

/* ════════════════════════════════════════
   STUDENT
════════════════════════════════════════ */

app.get('/api/student/events', async (c) => {
  const payload = await requireAuth(c, c.env);
  if (!payload) return c.json({ error: 'Not authenticated' }, 401);
  const uid = Number(payload.sub);
  const now = NOW();

  const events = await db.all(c.env, `
    SELECT e.*,
      r.status AS userStatus, r.id AS reservationId, r.claimed_at AS claimedAt,
      ci.id AS checkinId
    FROM events e
    LEFT JOIN reservations r  ON r.event_id=e.id AND r.user_id=?
    LEFT JOIN checkins     ci ON ci.event_id=e.id AND ci.user_id=?
    WHERE e.status != 'cancelled'
    ORDER BY e.game_datetime ASC
  `, uid, uid);

  return c.json(events.map(ev => {
    const pts = getEventPoints(ev);
    return {
      id: ev.id, name: ev.name, sport: ev.sport, datetime: ev.game_datetime,
      highImpact: !!ev.high_impact, mode: ev.mode, capacity: ev.capacity,
      tier: ev.tier, sportCategory: ev.sport_category,
      attendPoints: pts.attendPoints, claimBonus: pts.claimBonus,
      status: computeStatus(ev, now),
      userStatus: ev.userStatus || null, checkedIn: !!ev.checkinId,
      windowStatus: getWindowStatus(ev, now),
      windows: {
        reservationOpens:  ev.reservation_opens,
        reservationCloses: ev.reservation_closes,
        drawAt:            ev.draw_at,
        claimOpens:        ev.claim_opens,
        claimCloses:       ev.claim_closes,
        waitlistCascade:   ev.waitlist_cascade,
        openClaimStart:    ev.open_claim_start,
        dropCloses:        ev.drop_closes,
      },
    };
  }));
});

app.post('/api/student/reserve/:eventId', async (c) => {
  const payload = await requireAuth(c, c.env);
  if (!payload) return c.json({ error: 'Not authenticated' }, 401);
  const uid = Number(payload.sub);
  const eid = Number(c.req.param('eventId'));
  const now = NOW();

  const event = await db.first(c.env, 'SELECT * FROM events WHERE id=?', eid);
  if (!event) return c.json({ error: 'Event not found.' }, 404);
  if (event.mode !== 'reservation_required') return c.json({ error: 'This event does not require a reservation.' }, 400);
  if (now < event.reservation_opens || now > event.reservation_closes)
    return c.json({ error: 'Reservation window is not currently open.' }, 400);

  const existing = await db.first(c.env, 'SELECT id FROM reservations WHERE user_id=? AND event_id=?', uid, eid);
  if (existing) return c.json({ error: 'Already reserved for this event.' }, 409);

  await db.run(c.env, `INSERT INTO reservations(user_id,event_id,status,reserved_at) VALUES(?,?,'reserved',?)`, uid, eid, now);
  return c.json({ ok: true, message: 'Reserved. You will be notified when the draw runs.' });
});

app.post('/api/student/claim/:eventId', async (c) => {
  const payload = await requireAuth(c, c.env);
  if (!payload) return c.json({ error: 'Not authenticated' }, 401);
  const uid = Number(payload.sub);
  const eid = Number(c.req.param('eventId'));
  const now = NOW();

  const event = await db.first(c.env, 'SELECT * FROM events WHERE id=?', eid);
  if (!event) return c.json({ error: 'Event not found.' }, 404);

  const reservation = await db.first(c.env, 'SELECT * FROM reservations WHERE user_id=? AND event_id=?', uid, eid);
  if (!reservation) return c.json({ error: 'No reservation found for this event.' }, 400);
  if (!['selected', 'confirmed'].includes(reservation.status))
    return c.json({ error: 'You have not been selected for this event.' }, 400);

  const inClaim     = event.claim_opens && now >= event.claim_opens && now <= event.claim_closes;
  const inOpenClaim = event.open_claim_start && now >= event.open_claim_start;
  if (!inClaim && !inOpenClaim) return c.json({ error: 'Claim window is not currently open.' }, 400);
  if (event.drop_closes && now > event.drop_closes) return c.json({ error: 'Claim window has closed.' }, 400);

  await db.run(c.env, `UPDATE reservations SET status='claimed', claimed_at=? WHERE user_id=? AND event_id=?`, now, uid, eid);

  /* Award claim bonus for non-football/MBB events */
  const pts = getEventPoints(event);
  if (pts.claimBonus > 0) {
    await db.run(c.env, 'UPDATE users SET season_points=season_points+?,lifetime_points=lifetime_points+? WHERE id=?', pts.claimBonus, pts.claimBonus, uid);
    await db.run(c.env, `INSERT INTO points_history(user_id,event_id,amount,type,description,created_at) VALUES(?,?,?,?,?,?)`,
      uid, eid, pts.claimBonus, 'claim_bonus', `Claim bonus: ${event.name}`, now);
  }

  return c.json({ ok: true, message: 'Spot claimed. Show your physical RaiderCard at the gate.' });
});

app.post('/api/student/drop/:eventId', async (c) => {
  const payload = await requireAuth(c, c.env);
  if (!payload) return c.json({ error: 'Not authenticated' }, 401);
  const uid = Number(payload.sub);
  const eid = Number(c.req.param('eventId'));
  const now = NOW();

  const event = await db.first(c.env, 'SELECT * FROM events WHERE id=?', eid);
  if (!event) return c.json({ error: 'Event not found.' }, 404);

  const reservation = await db.first(c.env, 'SELECT * FROM reservations WHERE user_id=? AND event_id=?', uid, eid);
  if (!reservation || !['selected','confirmed','claimed','reserved'].includes(reservation.status))
    return c.json({ error: 'No active claim to drop.' }, 400);
  if (event.drop_closes && now > event.drop_closes)
    return c.json({ error: 'Drop window has closed. Contact studentloyalty@ttu.edu.' }, 400);

  await db.run(c.env, `UPDATE reservations SET status='dropped',dropped_at=? WHERE user_id=? AND event_id=?`, now, uid, eid);

  const next = await db.first(c.env, `
    SELECT r.* FROM reservations r JOIN users u ON u.id=r.user_id
    WHERE r.event_id=? AND r.status='waitlisted'
    ORDER BY u.season_points DESC LIMIT 1
  `, eid);
  if (next) await db.run(c.env, `UPDATE reservations SET status='selected',selected_at=? WHERE id=?`, now, next.id);

  return c.json({ ok: true, message: 'Spot dropped. A waitlisted Raider has been notified.' });
});

app.get('/api/student/activity', async (c) => {
  const payload = await requireAuth(c, c.env);
  if (!payload) return c.json({ error: 'Not authenticated' }, 401);
  const uid = Number(payload.sub);

  const history = await db.all(c.env, `
    SELECT ph.*, e.name AS eventName, e.sport
    FROM points_history ph
    LEFT JOIN events e ON e.id=ph.event_id
    WHERE ph.user_id=?
    ORDER BY ph.created_at DESC LIMIT 50
  `, uid);

  const stats = await db.first(c.env, `
    SELECT COUNT(DISTINCT ci.event_id) AS eventsAttended, COUNT(DISTINCT ns.id) AS noShows
    FROM users u
    LEFT JOIN checkins      ci ON ci.user_id=u.id
    LEFT JOIN no_show_flags ns ON ns.user_id=u.id AND ns.dispute_status!='cleared'
    WHERE u.id=?
  `, uid);

  return c.json({ history, stats });
});

/* ════════════════════════════════════════
   ADMIN
════════════════════════════════════════ */

app.get('/api/admin/events', async (c) => {
  const payload = await requireAuth(c, c.env, true);
  if (!payload) return c.json({ error: 'Forbidden' }, 403);
  const now = NOW();
  const events = await db.all(c.env, `
    SELECT e.*,
      (SELECT COUNT(*) FROM reservations r WHERE r.event_id=e.id AND r.status NOT IN ('dropped')) AS reservationCount,
      (SELECT COUNT(*) FROM reservations r WHERE r.event_id=e.id AND r.status='claimed') AS claimCount,
      (SELECT COUNT(*) FROM no_show_flags n WHERE n.event_id=e.id AND n.dispute_status='pending') AS pendingFlags
    FROM events e ORDER BY e.game_datetime ASC
  `);
  return c.json(events.map(ev => ({ ...ev, computedStatus: computeStatus(ev, now) })));
});

app.post('/api/admin/events', async (c) => {
  const payload = await requireAuth(c, c.env, true);
  if (!payload) return c.json({ error: 'Forbidden' }, 403);
  const b = await c.req.json();
  const r = await db.run(c.env, `
    INSERT INTO events(name,sport,game_datetime,high_impact,mode,capacity,ticket_office_allotment,
      tier,sport_category,draw_at,status,
      reservation_opens,reservation_closes,claim_opens,claim_closes,
      waitlist_cascade,open_claim_start,drop_closes)
    VALUES(?,?,?,?,?,?,?,?,?,?,'scheduled',?,?,?,?,?,?,?)
  `, b.name, b.sport, b.game_datetime, b.high_impact?1:0, b.mode||'reservation_required',
     b.capacity||9500, b.ticket_office_allotment||0,
     b.tier||null, b.sport_category||'other', b.draw_at||null,
     b.reservation_opens||null, b.reservation_closes||null,
     b.claim_opens||null, b.claim_closes||null,
     b.waitlist_cascade||null, b.open_claim_start||null, b.drop_closes||null);
  return c.json({ ok: true, id: r.meta.last_row_id });
});

app.put('/api/admin/events/:id', async (c) => {
  const payload = await requireAuth(c, c.env, true);
  if (!payload) return c.json({ error: 'Forbidden' }, 403);
  const fields = await c.req.json();
  /* status is NOT in the allowlist — it auto-computes; only exception is 'cancelled' via separate endpoint */
  const allowed = ['name','sport','game_datetime','high_impact','mode','capacity',
    'ticket_office_allotment','tier','sport_category','draw_at',
    'reservation_opens','reservation_closes','claim_opens','claim_closes',
    'waitlist_cascade','open_claim_start','drop_closes'];
  const sets = allowed.filter(k => k in fields).map(k => `${k}=?`).join(',');
  const vals = allowed.filter(k => k in fields).map(k => fields[k]);
  if (!sets) return c.json({ error: 'No valid fields.' }, 400);
  await db.run(c.env, `UPDATE events SET ${sets} WHERE id=?`, ...vals, c.req.param('id'));
  return c.json({ ok: true });
});

app.post('/api/admin/events/:id/cancel', async (c) => {
  const payload = await requireAuth(c, c.env, true);
  if (!payload) return c.json({ error: 'Forbidden' }, 403);
  await db.run(c.env, `UPDATE events SET status='cancelled' WHERE id=?`, c.req.param('id'));
  return c.json({ ok: true });
});

app.get('/api/admin/events/:id/dashboard', async (c) => {
  const payload = await requireAuth(c, c.env, true);
  if (!payload) return c.json({ error: 'Forbidden' }, 403);
  const eid = c.req.param('id');
  const now = NOW();

  const event = await db.first(c.env, 'SELECT * FROM events WHERE id=?', eid);
  if (!event) return c.json({ error: 'Not found.' }, 404);

  const reservationCount = (await db.first(c.env, `SELECT COUNT(*) AS n FROM reservations WHERE event_id=? AND status NOT IN ('dropped')`, eid)).n;
  const claimCount       = (await db.first(c.env, `SELECT COUNT(*) AS n FROM reservations WHERE event_id=? AND status='claimed'`, eid)).n;
  const confirmedCount   = (await db.first(c.env, `SELECT COUNT(*) AS n FROM reservations WHERE event_id=? AND status IN ('selected','confirmed','claimed')`, eid)).n;
  const waitlistedCount  = (await db.first(c.env, `SELECT COUNT(*) AS n FROM reservations WHERE event_id=? AND status='waitlisted'`, eid)).n;
  const pendingFlags     = (await db.first(c.env, `SELECT COUNT(*) AS n FROM no_show_flags WHERE event_id=? AND dispute_status='pending'`, eid)).n;
  const showRate         = reservationCount > 0 ? Math.round((claimCount / reservationCount) * 100) : 0;
  const capacityUsed     = event.capacity > 0 ? Math.round((confirmedCount / event.capacity) * 100) : 0;
  const pts              = getEventPoints(event);

  return c.json({
    event: { ...event, computedStatus: computeStatus(event, now) },
    reservationCount, claimCount, confirmedCount, waitlistedCount,
    pendingFlags, showRate, capacityUsed,
    pts,
  });
});

app.post('/api/admin/events/:id/run-selection', async (c) => {
  const payload = await requireAuth(c, c.env, true);
  if (!payload) return c.json({ error: 'Forbidden' }, 403);
  const eid = Number(c.req.param('id'));
  const result = await runSelectionForEvent(c.env, eid);
  if (!result) return c.json({ error: 'Event not found.' }, 404);
  return c.json({ ok: true, ...result, message: `Selection complete. ${result.confirmed} confirmed, ${result.waitlisted} waitlisted.` });
});

app.post('/api/admin/events/:id/allot-tickets', async (c) => {
  const payload = await requireAuth(c, c.env, true);
  if (!payload) return c.json({ error: 'Forbidden' }, 403);
  const eid = Number(c.req.param('id'));
  const event = await db.first(c.env, 'SELECT * FROM events WHERE id=?', eid);
  if (!event) return c.json({ error: 'Event not found.' }, 404);
  const allotment = event.ticket_office_allotment || 0;
  if (!allotment) return c.json({ error: 'No ticket office allotment set for this event.' }, 400);

  const now = NOW();
  const waitlisted = await db.all(c.env, `
    SELECT r.id AS resId FROM reservations r JOIN users u ON u.id=r.user_id
    WHERE r.event_id=? AND r.status='waitlisted'
    ORDER BY u.season_points DESC, r.reserved_at ASC
    LIMIT ?
  `, eid, allotment);

  for (const w of waitlisted)
    await db.run(c.env, `UPDATE reservations SET status='selected',selected_at=? WHERE id=?`, now, w.resId);

  return c.json({ ok: true, allotted: waitlisted.length, message: `${waitlisted.length} waitlisted students moved to selected from ticket office allotment.` });
});

app.post('/api/admin/events/:id/noshow-sweep', async (c) => {
  const payload = await requireAuth(c, c.env, true);
  if (!payload) return c.json({ error: 'Forbidden' }, 403);
  const eid = Number(c.req.param('id'));
  const event = await db.first(c.env, 'SELECT * FROM events WHERE id=?', eid);
  if (!event) return c.json({ error: 'Not found.' }, 404);
  const now = NOW();
  if (now <= event.game_datetime) return c.json({ error: 'Game has not occurred yet.' }, 400);

  const noShows = await db.all(c.env, `
    SELECT r.user_id, r.event_id FROM reservations r
    WHERE r.event_id=? AND r.status='claimed'
      AND r.user_id NOT IN (SELECT ci.user_id FROM checkins ci WHERE ci.event_id=?)
  `, eid, eid);

  const { noshowPenalty } = getEventPoints(event);
  let flagged = 0;
  for (const ns of noShows) {
    const existing = await db.first(c.env, 'SELECT id FROM no_show_flags WHERE user_id=? AND event_id=?', ns.user_id, ns.event_id);
    if (!existing) {
      await db.run(c.env, `INSERT INTO no_show_flags(user_id,event_id,penalty_points,created_at) VALUES(?,?,?,?)`, ns.user_id, ns.event_id, noshowPenalty, now);
      flagged++;
    }
  }
  return c.json({ ok: true, flagged, message: `Sweep complete. ${flagged} students flagged.` });
});

app.get('/api/admin/students', async (c) => {
  const payload = await requireAuth(c, c.env, true);
  if (!payload) return c.json({ error: 'Forbidden' }, 403);
  const q = c.req.query('q') ? `%${c.req.query('q')}%` : '%';
  const students = await db.all(c.env, `
    SELECT id,name,erider,r_number,class,fee_paid,role,season_points,lifetime_points,
      (SELECT COUNT(*) FROM no_show_flags n WHERE n.user_id=users.id AND n.dispute_status!='cleared') AS noShows
    FROM users WHERE role='student' AND (name LIKE ? OR erider LIKE ? OR r_number LIKE ?)
    ORDER BY season_points DESC
  `, q, q, q);
  return c.json(students);
});

app.get('/api/admin/disputes', async (c) => {
  const payload = await requireAuth(c, c.env, true);
  if (!payload) return c.json({ error: 'Forbidden' }, 403);
  const status = c.req.query('status') || 'pending';
  const disputes = await db.all(c.env, `
    SELECT ns.*, u.name AS studentName, u.erider, u.r_number, e.name AS eventName, e.game_datetime
    FROM no_show_flags ns JOIN users u ON u.id=ns.user_id JOIN events e ON e.id=ns.event_id
    WHERE ns.dispute_status=? ORDER BY ns.created_at DESC
  `, status);
  return c.json(disputes);
});

app.post('/api/admin/disputes/:id/clear', async (c) => {
  const payload = await requireAuth(c, c.env, true);
  if (!payload) return c.json({ error: 'Forbidden' }, 403);
  const flag = await db.first(c.env, 'SELECT * FROM no_show_flags WHERE id=?', c.req.param('id'));
  if (!flag) return c.json({ error: 'Not found.' }, 404);
  await db.run(c.env, `UPDATE no_show_flags SET dispute_status='cleared' WHERE id=?`, c.req.param('id'));
  const ph = await db.first(c.env, `SELECT * FROM points_history WHERE user_id=? AND event_id=? AND type='penalty'`, flag.user_id, flag.event_id);
  if (ph) {
    await db.run(c.env, 'UPDATE users SET season_points=season_points+?,lifetime_points=lifetime_points+? WHERE id=?', flag.penalty_points, flag.penalty_points, flag.user_id);
    await db.run(c.env, 'DELETE FROM points_history WHERE id=?', ph.id);
  }
  return c.json({ ok: true });
});

app.post('/api/admin/disputes/:id/uphold', async (c) => {
  const payload = await requireAuth(c, c.env, true);
  if (!payload) return c.json({ error: 'Forbidden' }, 403);
  const flag = await db.first(c.env, 'SELECT * FROM no_show_flags WHERE id=?', c.req.param('id'));
  if (!flag) return c.json({ error: 'Not found.' }, 404);
  await db.run(c.env, `UPDATE no_show_flags SET dispute_status='upheld' WHERE id=?`, c.req.param('id'));
  const already = await db.first(c.env, `SELECT id FROM points_history WHERE user_id=? AND event_id=? AND type='penalty'`, flag.user_id, flag.event_id);
  if (!already) {
    const now = NOW();
    await db.run(c.env, `INSERT INTO points_history(user_id,event_id,amount,type,description,created_at) VALUES(?,?,?,?,?,?)`,
      flag.user_id, flag.event_id, -flag.penalty_points, 'penalty', 'No-show penalty upheld', now);
    await db.run(c.env, 'UPDATE users SET season_points=MAX(0,season_points-?),lifetime_points=MAX(0,lifetime_points-?) WHERE id=?',
      flag.penalty_points, flag.penalty_points, flag.user_id);
  }
  return c.json({ ok: true });
});

app.post('/api/admin/checkin', async (c) => {
  const payload = await requireAuth(c, c.env, true);
  if (!payload) return c.json({ error: 'Forbidden' }, 403);
  const { rNumber, eventId } = await c.req.json();
  if (!rNumber || !eventId) return c.json({ error: 'rNumber and eventId required.' }, 400);

  const user  = await db.first(c.env, 'SELECT * FROM users WHERE r_number=?', rNumber.toUpperCase().trim());
  if (!user)  return c.json({ success: false, reason: 'Student not found.' });
  if (!user.fee_paid) return c.json({ success: false, reason: 'Athletic fee not on file.' });

  const event = await db.first(c.env, 'SELECT * FROM events WHERE id=?', eventId);
  if (!event) return c.json({ error: 'Event not found.' }, 404);

  const res = await db.first(c.env, 'SELECT * FROM reservations WHERE user_id=? AND event_id=?', user.id, eventId);
  if (event.mode === 'reservation_required') {
    if (!res || !['selected','confirmed','claimed'].includes(res.status))
      return c.json({ success: false, reason: 'No confirmed claim. Direct to waitlist area.', student: user.name });
  }

  const already = await db.first(c.env, 'SELECT id FROM checkins WHERE user_id=? AND event_id=?', user.id, eventId);
  if (already) return c.json({ success: true, alreadyScanned: true, student: user.name, pointsAwarded: 0 });

  const { attendPoints } = getEventPoints(event);
  const now = NOW();
  await db.run(c.env, 'INSERT INTO checkins(user_id,event_id,scanned_at,points_awarded) VALUES(?,?,?,?)', user.id, eventId, now, attendPoints);
  await db.run(c.env, 'UPDATE users SET season_points=season_points+?,lifetime_points=lifetime_points+? WHERE id=?', attendPoints, attendPoints, user.id);
  await db.run(c.env, `INSERT INTO points_history(user_id,event_id,amount,type,description,created_at) VALUES(?,?,?,?,?,?)`,
    user.id, eventId, attendPoints, 'attendance', event.name, now);
  if (res) await db.run(c.env, `UPDATE reservations SET status='claimed' WHERE user_id=? AND event_id=?`, user.id, eventId);

  return c.json({ success: true, student: user.name, rNumber: user.r_number, pointsAwarded: attendPoints, newTotal: user.season_points + attendPoints });
});

app.get('/api/admin/config', async (c) => {
  const payload = await requireAuth(c, c.env, true);
  if (!payload) return c.json({ error: 'Forbidden' }, 403);
  const rows = await db.all(c.env, 'SELECT * FROM config');
  return c.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
});

app.put('/api/admin/config', async (c) => {
  const payload = await requireAuth(c, c.env, true);
  if (!payload) return c.json({ error: 'Forbidden' }, 403);
  const body = await c.req.json();
  for (const [k, v] of Object.entries(body))
    await db.run(c.env, 'INSERT OR REPLACE INTO config(key,value) VALUES(?,?)', k, String(v));
  return c.json({ ok: true });
});

/* ── Scheduled: auto-run draws ── */
async function runPendingDraws(env) {
  const now = new Date().toISOString();
  const pending = await db.all(env,
    `SELECT id FROM events WHERE draw_at IS NOT NULL AND draw_at <= ? AND draw_run=0 AND status='scheduled'`, now);
  for (const ev of pending) await runSelectionForEvent(env, ev.id);
}

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runPendingDraws(env));
  },
};
