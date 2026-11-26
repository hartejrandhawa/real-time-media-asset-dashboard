require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');

const pool = require('./config/db');
const authRoutes = require('./routes/auth');
const assetRoutes = require('./routes/assets');
const { errorHandler } = require('./errors');

const app = express();
app.disable('x-powered-by');

// Comma-separated list of allowed browser origins, e.g. your deployed
// frontend URL. Defaults to the Vite dev server.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok' });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'unreachable' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/assets', assetRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

module.exports = app;
