const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate); // every route below requires a valid JWT

// GET /api/assets?tenant_id=&status=&asset_type=&page=&pageSize=
// Search/filter with pagination — uses the composite index on (tenant_id, status, created_at)
router.get('/', async (req, res) => {
  const { tenant_id, status, asset_type, page = 1, pageSize = 20 } = req.query;

  const conditions = [];
  const params = [];

  if (tenant_id) {
    conditions.push('tenant_id = ?');
    params.push(tenant_id);
  }
  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (asset_type) {
    conditions.push('asset_type = ?');
    params.push(asset_type);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(parseInt(pageSize, 10) || 20, 100);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;

  try {
    const [rows] = await pool.query(
      `SELECT id, filename, asset_type, status, tenant_id, file_size, created_at, updated_at
       FROM assets
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM assets ${whereClause}`,
      params
    );

    res.json({ data: rows, total, page: Number(page), pageSize: limit });
  } catch (err) {
    res.status(500).json({ error: 'Search failed', detail: err.message });
  }
});

// GET /api/assets/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM assets WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Asset not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Fetch failed', detail: err.message });
  }
});

// PATCH /api/assets/:id/status — only editor/admin can change status
router.patch('/:id/status', requireRole('admin', 'editor'), async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'processing', 'ready', 'failed', 'archived'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${validStatuses.join(', ')}` });
  }

  try {
    const [result] = await pool.query(
      'UPDATE assets SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Asset not found' });

    await pool.query(
      'INSERT INTO ingestion_logs (asset_id, event_type, message, created_at) VALUES (?, ?, ?, NOW())',
      [req.params.id, 'status_change', `Status changed to ${status} by ${req.user.username}`]
    );

    res.json({ id: req.params.id, status });
  } catch (err) {
    res.status(500).json({ error: 'Update failed', detail: err.message });
  }
});

// DELETE /api/assets/:id — admin only
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM assets WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Asset not found' });
    res.json({ deleted: req.params.id });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed', detail: err.message });
  }
});

// GET /api/assets/:id/logs
router.get('/:id/logs', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM ingestion_logs WHERE asset_id = ? ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Fetch failed', detail: err.message });
  }
});

module.exports = router;
