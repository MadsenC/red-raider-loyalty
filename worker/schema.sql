CREATE TABLE IF NOT EXISTS users (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  erider           TEXT UNIQUE NOT NULL,
  r_number         TEXT UNIQUE,
  class            TEXT,
  fee_paid         INTEGER DEFAULT 0,
  role             TEXT NOT NULL DEFAULT 'student',
  password_hash    TEXT NOT NULL,
  season_points    INTEGER DEFAULT 0,
  lifetime_points  INTEGER DEFAULT 0,
  created_at       TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  name                    TEXT NOT NULL,
  sport                   TEXT NOT NULL,
  game_datetime           TEXT NOT NULL,
  high_impact             INTEGER DEFAULT 0,
  mode                    TEXT NOT NULL DEFAULT 'reservation_required',
  capacity                INTEGER DEFAULT 9500,
  ticket_office_allotment INTEGER DEFAULT 0,
  attendance_points       INTEGER DEFAULT 100,
  status                  TEXT NOT NULL DEFAULT 'scheduled',
  reservation_opens       TEXT,
  reservation_closes      TEXT,
  claim_opens             TEXT,
  claim_closes            TEXT,
  waitlist_cascade        TEXT,
  open_claim_start        TEXT,
  drop_closes             TEXT
);

CREATE TABLE IF NOT EXISTS reservations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  event_id    INTEGER NOT NULL REFERENCES events(id),
  status      TEXT NOT NULL DEFAULT 'reserved',
  reserved_at TEXT,
  selected_at TEXT,
  claimed_at  TEXT,
  dropped_at  TEXT,
  UNIQUE(user_id, event_id)
);

CREATE TABLE IF NOT EXISTS checkins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  event_id      INTEGER NOT NULL REFERENCES events(id),
  scanned_at    TEXT,
  points_awarded INTEGER DEFAULT 0,
  UNIQUE(user_id, event_id)
);

CREATE TABLE IF NOT EXISTS points_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  event_id    INTEGER,
  reward_id   INTEGER,
  amount      INTEGER NOT NULL,
  type        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS no_show_flags (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  event_id       INTEGER NOT NULL REFERENCES events(id),
  penalty_points INTEGER DEFAULT 150,
  dispute_status TEXT NOT NULL DEFAULT 'pending',
  created_at     TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, event_id)
);

CREATE TABLE IF NOT EXISTS rewards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  category    TEXT,
  points_cost INTEGER NOT NULL,
  active      INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS redemptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  reward_id   INTEGER NOT NULL REFERENCES rewards(id),
  redeemed_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
