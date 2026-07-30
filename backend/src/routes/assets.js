const express = require('express');
const crypto = require('crypto');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { BUCKET_NAME, getUploadUrl, getDownloadUrl, deleteObject } = require('../config/s3');

const router = express.Router();
router.use(authenticate); // every route below requires a valid JWT

// POST /api/assets — editor/admin only. Creates the metadata row and
// returns a presigned S3 PUT URL; the client uploads the file bytes
// directly to S3, then calls /confirm-upload.
router.post('/', requireRole('admin', 'editor'), async (req, res) => {
  const { filename, asset_type, tenant_id, content_type } = req.body;
  if (!filename || !asset_type || !tenant_id) {
    return res.status(400).json({ error: 'filename, asset_type, and tenant_id are required' });
  }

  const s3Key = `${tenant_id}/${crypto.randomUUID()}-${filename}`;

  try {
    const [result] = await pool.query(
      `INSERT INTO assets (filename, asset_type, status, tenant_id, s3_bucket, s3_key, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, ?, ?, NOW(), NOW())`,
      [filename, asset_type, tenant_id, BUCKET_NAME, s3Key]
    );

    await pool.query(
      'INSERT INTO ingestion_logs (asset_id, event_type, message, created_at) VALUES (?, ?, ?, NOW())',
      [result.insertId, 'created', `Asset created by ${req.user.username}, awaiting upload`]
    );

    const uploadUrl = await getUploadUrl(s3Key, content_type);
    res.status(201).json({ id: result.insertId, uploadUrl, expiresIn: 300 });
  } catch (err) {
    res.status(500).json({ error: 'Asset creation failed', detail: err.message });
  }
});

// POST /api/assets/:id/confirm-upload — client calls this after the S3
// PUT succeeds, so we can record the real file size and mark it ready.
router.post('/:id/confirm-upload', requireRole('admin', 'editor'), async (req, res) => {
  const { file_size } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE assets SET status = 'ready', file_size = ?, updated_at = NOW() WHERE id = ?`,
      [file_size ?? null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Asset not found' });

    await pool.query(
      'INSERT INTO ingestion_logs (asset_id, event_type, message, created_at) VALUES (?, ?, ?, NOW())',
      [req.params.id, 'upload_confirmed', `Upload confirmed by ${req.user.username}`]
    );

    res.json({ id: req.params.id, status: 'ready' });
  } catch (err) {
    res.status(500).json({ error: 'Confirmation failed', detail: err.message });
  }
});

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
      `SELECT id, filename, asset_type, status, tenant_id, file_size, created_at, updated_at,
              (s3_key IS NOT NULL) AS has_file
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

// GET /api/assets/:id/download-url — presigned S3 GET URL for the file
router.get('/:id/download-url', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT s3_key FROM assets WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Asset not found' });
    if (!rows[0].s3_key) return res.status(404).json({ error: 'No file uploaded for this asset' });

    const url = await getDownloadUrl(rows[0].s3_key);
    res.json({ url, expiresIn: 300 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate download URL', detail: err.message });
  }
});

// DELETE /api/assets/:id — admin only
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT s3_key FROM assets WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Asset not found' });

    if (rows[0].s3_key) {
      await deleteObject(rows[0].s3_key);
    }

    await pool.query('DELETE FROM assets WHERE id = ?', [req.params.id]);
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
