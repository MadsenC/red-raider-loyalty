const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const db      = require('../database/db');

/* POST /api/auth/login */
router.post('/login', (req, res) => {
  const { erider, password } = req.body;
  if (!erider || !password) {
    return res.status(400).json({ error: 'eRaider and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE erider = ?').get(erider.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid eRaider or password.' });
  }

  if (!user.fee_paid) {
    return res.status(403).json({ error: 'fee_required', redirect: '/athleticfee.html' });
  }

  req.session.userId  = user.id;
  req.session.erider  = user.erider;
  req.session.name    = user.name;
  req.session.role    = user.role;

  return res.json({
    id:       user.id,
    name:     user.name,
    erider:   user.erider,
    class:    user.class,
    role:     user.role,
    feePaid:  !!user.fee_paid,
  });
});

/* POST /api/auth/logout */
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

/* GET /api/auth/me — returns current session user */
router.get('/me', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });

  const user = db.prepare(
    'SELECT id,name,erider,class,fee_paid,role,season_points,lifetime_points FROM users WHERE id=?'
  ).get(req.session.userId);

  if (!user) return res.status(401).json({ error: 'User not found' });

  /* Season standing rank */
  const rank = db.prepare(
    'SELECT COUNT(*)+1 AS rank FROM users WHERE season_points > ? AND role="student"'
  ).get(user.season_points).rank;

  const total = db.prepare('SELECT COUNT(*) AS n FROM users WHERE role="student"').get().n;

  return res.json({
    id:             user.id,
    name:           user.name,
    erider:         user.erider,
    class:          user.class,
    feePaid:        !!user.fee_paid,
    role:           user.role,
    seasonPoints:   user.season_points,
    lifetimePoints: user.lifetime_points,
    rank,
    totalStudents:  total,
  });
});

module.exports = router;
