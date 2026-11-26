const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { authenticate, signToken } = require('../middleware/auth');
const { HttpError } = require('../errors');

const router = express.Router();

const USERNAME_RE = /^[A-Za-z0-9_.-]{3,50}$/;
const MIN_PASSWORD = 8;

// Self-registration always creates a viewer. Roles are never taken from the
// request body: otherwise anyone could sign up as admin and delete assets.
// Editor/admin accounts are provisioned out of band (see scripts/seed.js).
router.post('/register', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    throw new HttpError(400, 'Username must be 3–50 characters: letters, numbers, . _ -');
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    throw new HttpError(400, `Password must be at least ${MIN_PASSWORD} characters`);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  let result;
  try {
    // Rely on the UNIQUE constraint instead of SELECT-then-INSERT, which
    // races when two people register the same name at once.
    [result] = await pool.query(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'viewer')",
      [username, passwordHash]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Username already taken');
    throw err;
  }

  const user = { id: result.insertId, username, role: 'viewer' };
  res.status(201).json({ token: signToken(user), username, role: user.role });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    throw new HttpError(400, 'username and password are required');
  }

  const [rows] = await pool.query(
    'SELECT id, username, password_hash, role FROM users WHERE username = ?',
    [username]
  );
  const user = rows[0];
  // Same message for unknown user and wrong password, so the endpoint
  // can't be used to discover which usernames exist.
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new HttpError(401, 'Invalid username or password');
  }

  res.json({ token: signToken(user), username: user.username, role: user.role });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

module.exports = router;
