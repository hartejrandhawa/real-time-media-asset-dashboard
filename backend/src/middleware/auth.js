const jwt = require('jsonwebtoken');
require('dotenv').config({ quiet: true });

const DEV_FALLBACK_SECRET = 'dev-only-insecure-secret';

function resolveSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  // Refuse to start in production with a guessable secret: anyone who knows
  // it could mint an admin token.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  console.warn('[auth] JWT_SECRET not set: using an insecure development secret');
  return DEV_FALLBACK_SECRET;
}

const JWT_SECRET = resolveSecret();

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  try {
    req.user = jwt.verify(authHeader.slice(7), JWT_SECRET); // { id, username, role }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Usage: requireRole('admin', 'editor')
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action' });
    }
    next();
  };
}

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, {
    expiresIn: '24h',
  });
}

module.exports = { authenticate, requireRole, signToken };
