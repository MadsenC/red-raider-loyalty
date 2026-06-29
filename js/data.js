/* ─── Mock Data — Replace with TTU SSO + Internal DB Calls ──────────────── */

const STUDENT = {
  name:          'Madsen Cooper',
  firstName:     'Madsen',
  class:         'SENIOR',
  rNumber:       'R11925460',
  eRaider:       'madscoop',
  feePaid:       true,
  seasonPoints:  2840,
  lifetimePoints: 8420,
  eventsAttended: 14,
  svcMember:     false,
  noShows:       1,
};

/* Points toward SVC membership */
const SVC_POINTS_NEEDED = 5680;

const EVENTS = [
  {
    id:          1,
    name:        'Football vs. Kansas',
    sport:       'Football',
    datetime:    '2026-09-05T14:00:00',
    highImpact:  true,
    mode:        'reservation_required',   // reservation_required | open
    capacity:    9500,
    userStatus:  'claimed',               // claimed | claim_window | waitlisted | open_claim | not_reserved | confirmed_open
    confirmed:   true,                    // above cutline = confirmed
    dropWindowCloses: '2026-09-04T14:00:00',
    attendancePoints: 150,
  },
  {
    id:          2,
    name:        'Football vs. ACU',
    sport:       'Football',
    datetime:    '2026-09-12T11:00:00',
    highImpact:  false,
    mode:        'reservation_required',
    capacity:    9500,
    userStatus:  'claim_window',
    confirmed:   false,
    dropWindowCloses: null,
    attendancePoints: 100,
  },
  {
    id:          3,
    name:        "Men's Basketball vs. Iowa State",
    sport:       "Men's Basketball",
    datetime:    '2026-01-10T13:00:00',
    highImpact:  true,
    mode:        'reservation_required',
    capacity:    4000,
    userStatus:  'waitlisted',
    confirmed:   false,
    dropWindowCloses: null,
    attendancePoints: 150,
  },
  {
    id:          4,
    name:        'Soccer vs. Texas',
    sport:       'Soccer',
    datetime:    '2026-09-18T19:00:00',
    highImpact:  false,
    mode:        'open',
    capacity:    2000,
    userStatus:  'confirmed_open',
    confirmed:   true,
    dropWindowCloses: null,
    attendancePoints: 50,
  },
  {
    id:          5,
    name:        'Volleyball vs. Baylor',
    sport:       'Volleyball',
    datetime:    '2026-09-22T18:30:00',
    highImpact:  false,
    mode:        'open',
    capacity:    1500,
    userStatus:  'not_reserved',
    confirmed:   false,
    dropWindowCloses: null,
    attendancePoints: 50,
  },
];

const REWARDS_CATALOG = [
  { id: 1, name: 'Early Entry Pass',    category: 'Priority Access',      points: 300,  available: true },
  { id: 2, name: 'Raider Red Tee',      category: 'Merchandise',          points: 500,  available: true },
  { id: 3, name: 'Sideline Pass',       category: 'Exclusive Experience', points: 2000, available: true },
  { id: 4, name: 'Meet the Team',       category: 'Exclusive Experience', points: 3500, available: true },
  { id: 5, name: "Raider Walk Access",  category: 'Priority Access',      points: 750,  available: true },
  { id: 6, name: 'Locker Room Tour',    category: 'Exclusive Experience', points: 5000, available: false },
];

const POINTS_HISTORY = [
  { id: 1, event: 'Football vs. Texas',         date: '2025-09-20', points: +150, type: 'attendance' },
  { id: 2, event: 'Football vs. West Virginia', date: '2025-10-04', points: +150, type: 'attendance' },
  { id: 3, event: "Men's Basketball vs. Kansas", date: '2026-01-18', points: +150, type: 'attendance' },
  { id: 4, event: 'No-Show Penalty — Football vs. Baylor', date: '2025-11-15', points: -200, type: 'penalty' },
  { id: 5, event: 'Soccer vs. Oklahoma',        date: '2025-09-10', points: +50,  type: 'attendance' },
  { id: 6, event: 'Volleyball vs. Kansas State',date: '2025-10-15', points: +50,  type: 'attendance' },
  { id: 7, event: 'Senior Standing Bonus',      date: '2025-08-25', points: +500, type: 'standing' },
  { id: 8, event: 'Returning Raider Carry-Over',date: '2025-08-25', points: +1940, type: 'carryover' },
];

/* ── Admin Mock Data ── */

const ADMIN_EVENTS = [
  {
    id:         1,
    name:       'Football vs. Kansas',
    sport:      'Football',
    mode:       'Reservation Required',
    capacity:   9500,
    status:     'Scheduled',
    reservations: 0,
    claims:       0,
    noShowFlags:  0,
    datetime:   '2026-09-05T14:00:00',
    highImpact: true,
    windows: {
      reservationOpens:  '2026-09-01T08:00:00',
      reservationCloses: '2026-09-02T12:00:00',
      claimOpens:        '2026-09-02T14:00:00',
      claimCloses:       '2026-09-03T17:00:00',
      waitlistCascade:   '2026-09-03T17:01:00',
      openClaim:         '2026-09-04T08:00:00',
      dropCloses:        '2026-09-04T14:00:00',
    },
  },
  {
    id:         2,
    name:       'Football vs. ACU',
    sport:      'Football',
    mode:       'Reservation Required',
    capacity:   9500,
    status:     'Selection Complete',
    reservations: 7834,
    claims:       5210,
    noShowFlags:  0,
    datetime:   '2026-09-12T11:00:00',
    highImpact: false,
    windows: {
      reservationOpens:  '2026-09-08T08:00:00',
      reservationCloses: '2026-09-09T12:00:00',
      claimOpens:        '2026-09-09T14:00:00',
      claimCloses:       '2026-09-10T17:00:00',
      waitlistCascade:   '2026-09-10T17:01:00',
      openClaim:         '2026-09-11T08:00:00',
      dropCloses:        '2026-09-11T11:00:00',
    },
  },
  {
    id:         3,
    name:       "Men's Basketball vs. Iowa State",
    sport:      "Men's Basketball",
    mode:       'Reservation Required',
    capacity:   4000,
    status:     'Scheduled',
    reservations: 0,
    claims:       0,
    noShowFlags:  0,
    datetime:   '2026-01-10T13:00:00',
    highImpact: true,
    windows: null,
  },
  {
    id:         4,
    name:       'Soccer vs. Texas',
    sport:      'Soccer',
    mode:       'Open',
    capacity:   2000,
    status:     'Scheduled',
    reservations: 0,
    claims:       0,
    noShowFlags:  0,
    datetime:   '2026-09-18T19:00:00',
    highImpact: false,
    windows:    null,
  },
];

const ADMIN_STUDENTS = [
  { name: 'Andrew Lils',   rNumber: 'R11873238', eRaider: 'andrewl', class: 'SR', fee: true,  seasonPts: 100, lifetimePts: 1200 },
  { name: 'Bryce Hewatt',  rNumber: 'R17171748', eRaider: 'brewatt', class: 'JR', fee: true,  seasonPts: 0,   lifetimePts: 0    },
  { name: 'J.P. Williams', rNumber: 'R00401438', eRaider: 'williJP', class: 'SR', fee: true,  seasonPts: 100, lifetimePts: 850  },
  { name: 'Madsen Cooper', rNumber: 'R11925460', eRaider: 'madscoop',class: 'SR', fee: true,  seasonPts: 0,   lifetimePts: 100  },
  { name: 'Will Shoaf',    rNumber: 'R11984332', eRaider: 'wshoaf',  class: 'FR', fee: true,  seasonPts: 0,   lifetimePts: 100  },
];

const NO_SHOW_DISPUTES = [
  {
    id:       1,
    student:  'Andrew Lils',
    rNumber:  'R11873238',
    event:    'Football vs. Texas',
    date:     '2025-09-20',
    penalty:  -200,
    reason:   'I was at the game — scanned in at Gate 5. Not sure why it didn\'t register.',
    status:   'pending',
  },
];

const CLASS_STANDING_POINTS = {
  FR: 100,
  SO: 200,
  JR: 350,
  SR: 500,
};

const EVENT_TIER_POINTS = {
  high_impact: 150,
  standard:    100,
  lower_demand: 50,
};

/* ── Helpers ── */
function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' · '
    + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
