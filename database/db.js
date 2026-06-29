const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'loyalty.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* ── Schema ── */
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    erider        TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    r_number      TEXT    UNIQUE NOT NULL,
    class         TEXT    NOT NULL CHECK(class IN ('FR','SO','JR','SR')),
    fee_paid      INTEGER NOT NULL DEFAULT 1,
    role          TEXT    NOT NULL DEFAULT 'student' CHECK(role IN ('student','admin')),
    season_points INTEGER NOT NULL DEFAULT 0,
    lifetime_points INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    name                    TEXT    NOT NULL,
    sport                   TEXT    NOT NULL,
    game_datetime           TEXT    NOT NULL,
    high_impact             INTEGER NOT NULL DEFAULT 0,
    mode                    TEXT    NOT NULL DEFAULT 'open'
                              CHECK(mode IN ('open','reservation_required')),
    capacity                INTEGER NOT NULL,
    ticket_office_allotment INTEGER NOT NULL DEFAULT 0,
    attendance_points       INTEGER NOT NULL DEFAULT 100,
    status                  TEXT    NOT NULL DEFAULT 'scheduled'
                              CHECK(status IN ('scheduled','selection_complete','cancelled')),
    reservation_opens       TEXT,
    reservation_closes      TEXT,
    claim_opens             TEXT,
    claim_closes            TEXT,
    waitlist_cascade        TEXT,
    open_claim_start        TEXT,
    drop_closes             TEXT,
    created_at              TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    event_id    INTEGER NOT NULL REFERENCES events(id),
    status      TEXT    NOT NULL DEFAULT 'reserved'
                  CHECK(status IN ('reserved','selected','confirmed','waitlisted','claimed','dropped')),
    reserved_at TEXT    DEFAULT (datetime('now')),
    selected_at TEXT,
    claimed_at  TEXT,
    dropped_at  TEXT,
    UNIQUE(user_id, event_id)
  );

  CREATE TABLE IF NOT EXISTS checkins (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id),
    event_id       INTEGER NOT NULL REFERENCES events(id),
    scanned_at     TEXT    DEFAULT (datetime('now')),
    points_awarded INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, event_id)
  );

  CREATE TABLE IF NOT EXISTS points_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    event_id    INTEGER REFERENCES events(id),
    amount      INTEGER NOT NULL,
    type        TEXT    NOT NULL
                  CHECK(type IN ('attendance','standing','carryover','penalty','redemption','bonus')),
    description TEXT,
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS no_show_flags (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    event_id        INTEGER NOT NULL REFERENCES events(id),
    penalty_points  INTEGER NOT NULL DEFAULT 0,
    disputed        INTEGER NOT NULL DEFAULT 0,
    dispute_reason  TEXT,
    dispute_status  TEXT    DEFAULT 'pending'
                      CHECK(dispute_status IN ('pending','cleared','upheld')),
    created_at      TEXT    DEFAULT (datetime('now')),
    UNIQUE(user_id, event_id)
  );

  CREATE TABLE IF NOT EXISTS rewards (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    category    TEXT    NOT NULL,
    points_cost INTEGER NOT NULL,
    active      INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS redemptions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    reward_id   INTEGER NOT NULL REFERENCES rewards(id),
    redeemed_at TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

module.exports = db;
