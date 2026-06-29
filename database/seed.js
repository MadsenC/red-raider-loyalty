/* Run once: node database/seed.js */
const db      = require('./db');
const bcrypt  = require('bcryptjs');

const HASH = (pw) => bcrypt.hashSync(pw, 10);

/* ── Wipe existing data ── */
db.exec(`
  DELETE FROM redemptions; DELETE FROM no_show_flags; DELETE FROM checkins;
  DELETE FROM points_history; DELETE FROM reservations; DELETE FROM rewards;
  DELETE FROM events; DELETE FROM users; DELETE FROM config;
`);

/* ── Config ── */
const cfgInsert = db.prepare(`INSERT INTO config(key,value) VALUES(?,?)`);
cfgInsert.run('svc_points_threshold',    '5680');
cfgInsert.run('svc_noshow_max_rebate',   '2');
cfgInsert.run('points_fr',               '100');
cfgInsert.run('points_so',               '200');
cfgInsert.run('points_jr',               '350');
cfgInsert.run('points_sr',               '500');
cfgInsert.run('points_high_impact',      '150');
cfgInsert.run('points_standard',         '100');
cfgInsert.run('points_lower_demand',     '50');
cfgInsert.run('penalty_high_impact',     '200');
cfgInsert.run('penalty_standard',        '150');
cfgInsert.run('penalty_lower_demand',    '75');

/* ── Users ── */
const userInsert = db.prepare(`
  INSERT INTO users(erider,password_hash,name,r_number,class,fee_paid,role,season_points,lifetime_points)
  VALUES(?,?,?,?,?,?,?,?,?)
`);

const users = [
  { erider:'madscoop', pw:'Wreck2026!', name:'Madsen Cooper',  r:'R11925460', class:'SR', fee:1, role:'admin',   sp:2840, lp:8420 },
  { erider:'andrewl',  pw:'Wreck2026!', name:'Andrew Lils',    r:'R11873238', class:'SR', fee:1, role:'student', sp:100,  lp:1200 },
  { erider:'jpwilliams',pw:'Wreck2026!',name:'J.P. Williams',  r:'R00401438', class:'SR', fee:1, role:'student', sp:850,  lp:2100 },
  { erider:'wshoaf',   pw:'Wreck2026!', name:'Will Shoaf',     r:'R11984332', class:'FR', fee:1, role:'student', sp:100,  lp:100  },
  { erider:'brewatt',  pw:'Wreck2026!', name:'Bryce Hewatt',   r:'R17171748', class:'JR', fee:1, role:'student', sp:0,    lp:0    },
];

const userIds = {};
for (const u of users) {
  const res = userInsert.run(u.erider, HASH(u.pw), u.name, u.r, u.class, u.fee, u.role, u.sp, u.lp);
  userIds[u.erider] = res.lastInsertRowid;
}

/* ── Events ──
   Windows are set relative to today (June 29, 2026) so the demo is live.
   Event 1: Reservation window CURRENTLY OPEN
   Event 2: Claim window CURRENTLY OPEN (selection already ran)
   Event 3: Future (reservation not yet open)
   Event 4: Open mode (lower demand, no reservation needed)
*/
const evInsert = db.prepare(`
  INSERT INTO events(name,sport,game_datetime,high_impact,mode,capacity,ticket_office_allotment,
    attendance_points,status,reservation_opens,reservation_closes,claim_opens,claim_closes,
    waitlist_cascade,open_claim_start,drop_closes)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`);

const evIds = {};

// Event 1 — reservation window currently open
let r = evInsert.run(
  'Football vs. Kansas','Football','2026-09-05T14:00:00',1,'reservation_required',9500,500,150,
  'scheduled',
  '2026-06-28T08:00:00','2026-07-01T12:00:00',
  '2026-07-01T14:00:00','2026-07-02T17:00:00',
  '2026-07-02T17:01:00','2026-07-03T08:00:00','2026-07-04T14:00:00'
);
evIds.kansas = r.lastInsertRowid;

// Event 2 — claim window currently open (selection already ran)
r = evInsert.run(
  'Football vs. ACU','Football','2026-09-12T11:00:00',0,'reservation_required',9500,500,100,
  'selection_complete',
  '2026-06-22T08:00:00','2026-06-24T12:00:00',
  '2026-06-27T14:00:00','2026-07-02T17:00:00',
  '2026-07-02T17:01:00','2026-07-03T08:00:00','2026-07-03T11:00:00'
);
evIds.acu = r.lastInsertRowid;

// Event 3 — future, high impact
r = evInsert.run(
  'Football vs. Texas','Football','2026-10-03T19:00:00',1,'reservation_required',9500,500,150,
  'scheduled',
  '2026-09-29T08:00:00','2026-09-30T12:00:00',
  '2026-09-30T14:00:00','2026-10-01T17:00:00',
  '2026-10-01T17:01:00','2026-10-02T08:00:00','2026-10-02T19:00:00'
);
evIds.texas = r.lastInsertRowid;

// Event 4 — open mode (Soccer)
r = evInsert.run(
  'Soccer vs. TCU','Soccer','2026-07-11T19:00:00',0,'open',2000,0,50,
  'scheduled',null,null,null,null,null,null,null
);
evIds.soccer = r.lastInsertRowid;

// Event 5 — past event (for points history)
r = evInsert.run(
  "Men's Basketball vs. Kansas",'Basketball','2026-01-18T13:00:00',1,'reservation_required',4000,200,150,
  'selection_complete',
  '2026-01-13T08:00:00','2026-01-14T12:00:00',
  '2026-01-14T14:00:00','2026-01-15T17:00:00',
  '2026-01-15T17:01:00','2026-01-16T08:00:00','2026-01-17T13:00:00'
);
evIds.mbb = r.lastInsertRowid;

// Event 6 — past event (for no-show flag)
r = evInsert.run(
  'Football vs. Baylor','Football','2025-11-15T14:30:00',1,'reservation_required',9500,500,150,
  'selection_complete',
  '2025-11-10T08:00:00','2025-11-11T12:00:00',
  '2025-11-11T14:00:00','2025-11-12T17:00:00',
  '2025-11-12T17:01:00','2025-11-13T08:00:00','2025-11-14T14:30:00'
);
evIds.baylor = r.lastInsertRowid;

/* ── Reservations for madscoop ── */
const resInsert = db.prepare(`
  INSERT INTO reservations(user_id,event_id,status,reserved_at,selected_at,claimed_at)
  VALUES(?,?,?,?,?,?)
`);
const mc = userIds.madscoop;

// Kansas: reserved (window currently open, not yet selected)
resInsert.run(mc, evIds.kansas, 'reserved', '2026-06-28T09:15:00', null, null);
// ACU: selected — claim window open, can claim now
resInsert.run(mc, evIds.acu, 'selected', '2026-06-23T10:00:00', '2026-06-27T15:00:00', null);
// Texas: waitlisted
resInsert.run(mc, evIds.texas, 'waitlisted', '2026-09-29T08:45:00', null, null);
// MBB vs Kansas (past): claimed + checked in
resInsert.run(mc, evIds.mbb, 'claimed', '2026-01-13T09:00:00', '2026-01-14T15:00:00', '2026-01-14T16:00:00');
// Baylor (past): claimed but NO checkin → no-show
resInsert.run(mc, evIds.baylor, 'claimed', '2025-11-10T09:00:00', '2025-11-11T15:00:00', '2025-11-11T16:00:00');

// Some reservations for other users (for admin demo)
resInsert.run(userIds.andrewl,    evIds.acu,    'selected',   '2026-06-23T10:00:00', '2026-06-27T15:00:00', null);
resInsert.run(userIds.jpwilliams, evIds.acu,    'confirmed',  '2026-06-23T10:00:00', '2026-06-27T15:00:00', '2026-06-28T09:00:00');
resInsert.run(userIds.jpwilliams, evIds.kansas, 'reserved',   '2026-06-28T09:00:00', null, null);
resInsert.run(userIds.wshoaf,     evIds.acu,    'waitlisted', '2026-06-23T11:00:00', null, null);

/* ── Check-ins (past events) ── */
const ciInsert = db.prepare(`INSERT INTO checkins(user_id,event_id,scanned_at,points_awarded) VALUES(?,?,?,?)`);
ciInsert.run(mc, evIds.mbb, '2026-01-18T13:25:00', 150);

/* ── Points history for madscoop ── */
const phInsert = db.prepare(`
  INSERT INTO points_history(user_id,event_id,amount,type,description,created_at)
  VALUES(?,?,?,?,?,?)
`);
phInsert.run(mc, null,        500,  'standing',   'Senior standing bonus',               '2025-08-25T08:00:00');
phInsert.run(mc, null,        1940, 'carryover',  'Returning Raider carry-over',         '2025-08-25T08:01:00');
phInsert.run(mc, evIds.mbb,   150,  'attendance', "Men's Basketball vs. Kansas",         '2026-01-18T13:30:00');
phInsert.run(mc, evIds.baylor,-200, 'penalty',    'No-show — Football vs. Baylor',       '2025-11-16T09:00:00');
phInsert.run(mc, null,        100,  'attendance', 'Soccer vs. Oklahoma',                 '2025-09-10T21:00:00');
phInsert.run(mc, null,        50,   'attendance', 'Volleyball vs. Kansas State',         '2025-10-15T20:30:00');
phInsert.run(mc, null,        150,  'attendance', 'Football vs. West Virginia',          '2025-10-04T19:30:00');
phInsert.run(mc, null,        150,  'attendance', 'Football vs. Texas (2025)',           '2025-09-20T19:00:00');

// History for other users
phInsert.run(userIds.andrewl, null, 500, 'standing', 'Senior standing bonus', '2025-08-25T08:00:00');
phInsert.run(userIds.andrewl, null, -400, 'penalty', 'No-show penalty (prior season)', '2025-10-01T09:00:00');
phInsert.run(userIds.jpwilliams, null, 500, 'standing', 'Senior standing bonus', '2025-08-25T08:00:00');
phInsert.run(userIds.jpwilliams, null, 350, 'carryover', 'Returning Raider carry-over', '2025-08-25T08:01:00');
phInsert.run(userIds.wshoaf, null, 100, 'standing', 'Freshman standing bonus', '2025-08-25T08:00:00');

/* ── No-show flag for madscoop (Baylor game) ── */
const nsInsert = db.prepare(`
  INSERT INTO no_show_flags(user_id,event_id,penalty_points,disputed,dispute_reason,dispute_status,created_at)
  VALUES(?,?,?,?,?,?,?)
`);
nsInsert.run(mc, evIds.baylor, 200, 1,
  "I was at the game — scanned in at Gate 5. Not sure why it didn't register.",
  'pending', '2025-11-16T08:00:00');

// Resolved dispute for andrewl
nsInsert.run(userIds.andrewl, evIds.mbb, 200, 1,
  'My ID was scanned but I never got credit.',
  'cleared', '2026-01-19T10:00:00');

/* ── Rewards catalog ── */
const rwInsert = db.prepare(`INSERT INTO rewards(name,category,points_cost,active) VALUES(?,?,?,?)`);
rwInsert.run('Early Entry Pass',    'Priority Access',      300,  1);
rwInsert.run('Raider Red Tee',      'Merchandise',          500,  1);
rwInsert.run('Raider Walk Access',  'Priority Access',      750,  1);
rwInsert.run('Sideline Pass',       'Exclusive Experience', 2000, 1);
rwInsert.run('Meet the Team',       'Exclusive Experience', 3500, 1);
rwInsert.run('Locker Room Tour',    'Exclusive Experience', 5000, 0);

console.log('✓ Database seeded successfully.');
console.log('  Login: madscoop / Wreck2026!  (admin + student)');
console.log('  Login: andrewl  / Wreck2026!  (student)');
