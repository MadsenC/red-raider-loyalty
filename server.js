const express       = require('express');
const session       = require('express-session');
const SQLiteStore   = require('connect-sqlite3')(session);
const path          = require('path');
const fs            = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/* ── Middleware ── */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store:             new SQLiteStore({ db: 'sessions.db', dir: DATA_DIR }),
  secret:            process.env.SESSION_SECRET || 'rr-loyalty-dev-secret-change-in-prod',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    maxAge:   7 * 24 * 60 * 60 * 1000,  // 7 days
    httpOnly: true,
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
  },
}));

/* ── API Routes ── */
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/student', require('./routes/student'));
app.use('/api/admin',   require('./routes/admin'));

/* ── Static Files ── */
app.use(express.static(path.join(__dirname)));

/* ── Fallback: serve index.html for unknown routes (SPA support) ── */
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'index.html'));
});

/* ── Start ── */
app.listen(PORT, () => {
  console.log(`Red Raider Loyalty running on http://localhost:${PORT}`);
});
