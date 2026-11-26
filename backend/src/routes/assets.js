const express = require("express");
const crypto = require("crypto");
const pool = require("../config/db");
const { withTransaction } = require("../config/db");
const { authenticate, requireRole } = require("../middleware/auth");
const s3 = require("../config/s3");
const { HttpError } = require("../errors");
const { ASSET_TYPES, STATUSES } = require("../constants");

const router = express.Router();
router.use(authenticate); // every route below requires a valid JWT

const TENANT_RE = /^[A-Za-z0-9_-]{1,50}$/;
const MAX_PAGE_SIZE = 100;

// Reject non-numeric ids up front so every /:id route can assume a valid one.
router.param("id", (req, res, next, id) => {
  if (!/^\d+$/.test(id)) return next(new HttpError(404, "Asset not found"));
  next();
});

// Make a filename safe to use inside an S3 key: no path separators, no
// leading dots, no control/unicode oddities. The original name is still
// stored in the DB and used for the download's Content-Disposition.
function safeKeyName(filename) {
  const cleaned = filename
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^[.]+/, "")
    .slice(-120);
  return cleaned || "file";
}

function logEvent(conn, assetId, eventType, message) {
  return conn.query(
    "INSERT INTO ingestion_logs (asset_id, event_type, message, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())",
    [assetId, eventType, message],
  );
}

async function findAsset(id, conn = pool) {
  const [rows] = await conn.query("SELECT * FROM assets WHERE id = ?", [id]);
  if (rows.length === 0) throw new HttpError(404, "Asset not found");
  return rows[0];
}

// Shared WHERE-clause builder for search + stats so both filter identically.
function buildFilters({ tenant_id, status, asset_type, q }) {
  const conditions = [];
  const params = [];
  if (tenant_id) {
    conditions.push("tenant_id = ?");
    params.push(String(tenant_id));
  }
  if (status) {
    conditions.push("status = ?");
    params.push(String(status));
  }
  if (asset_type) {
    conditions.push("asset_type = ?");
    params.push(String(asset_type));
  }
  if (q) {
    // Escape LIKE wildcards so a search for "50%" means the literal text.
    conditions.push("filename LIKE ?");
    params.push(`%${String(q).replace(/[\\%_]/g, "\\$&")}%`);
  }
  return {
    where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

// GET /api/assets?tenant_id=&status=&asset_type=&q=&page=&pageSize=
// Search/filter with pagination. The common dashboard query
// (tenant + status, newest first) is served by idx_tenant_status_created.
router.get("/", async (req, res) => {
  const { where, params } = buildFilters(req.query);
  const pageSize = Math.min(
    Math.max(parseInt(req.query.pageSize, 10) || 20, 1),
    MAX_PAGE_SIZE,
  );
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const offset = (page - 1) * pageSize;

  const [[rows], [[{ total }]]] = await Promise.all([
    pool.query(
      `SELECT id, filename, asset_type, status, tenant_id, file_size, created_at, updated_at,
              (s3_key IS NOT NULL) AS has_file
       FROM assets
       ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    ),
    pool.query(`SELECT COUNT(*) AS total FROM assets ${where}`, params),
  ]);

  res.json({
    data: rows.map((r) => ({ ...r, has_file: Boolean(r.has_file) })),
    total: Number(total),
    page,
    pageSize,
  });
});

// GET /api/assets/stats?tenant_id= : counts per status for the summary cards
router.get("/stats", async (req, res) => {
  const { where, params } = buildFilters({ tenant_id: req.query.tenant_id });
  const [rows] = await pool.query(
    `SELECT status, COUNT(*) AS count, COALESCE(SUM(file_size), 0) AS bytes
     FROM assets ${where} GROUP BY status`,
    params,
  );
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  let total = 0;
  let totalBytes = 0;
  for (const r of rows) {
    byStatus[r.status] = Number(r.count);
    total += Number(r.count);
    totalBytes += Number(r.bytes);
  }
  res.json({ total, totalBytes, byStatus });
});

// GET /api/assets/tenants : distinct tenant ids, for filter autocomplete.
// Served by a loose index scan on the leading tenant_id column.
router.get("/tenants", async (req, res) => {
  const [rows] = await pool.query(
    "SELECT DISTINCT tenant_id FROM assets ORDER BY tenant_id LIMIT 500",
  );
  res.json(rows.map((r) => r.tenant_id));
});

// POST /api/assets : editor/admin only. Creates the metadata row and returns
// a presigned S3 PUT URL. The browser uploads the bytes straight to S3, then
// calls /confirm-upload, so file data never passes through this server.
router.post("/", requireRole("admin", "editor"), async (req, res) => {
  const { asset_type, tenant_id, content_type } = req.body ?? {};
  // Keep only the base name: browsers send plain names, but a crafted
  // request could send "../../x" or "C:\\path\\x".
  const filename =
    typeof req.body?.filename === "string"
      ? req.body.filename.split(/[\\/]/).pop().trim()
      : "";
  if (!filename || filename.length > 255) {
    throw new HttpError(400, "filename is required (max 255 characters)");
  }
  if (!ASSET_TYPES.includes(asset_type)) {
    throw new HttpError(
      400,
      `asset_type must be one of ${ASSET_TYPES.join(", ")}`,
    );
  }
  if (typeof tenant_id !== "string" || !TENANT_RE.test(tenant_id)) {
    throw new HttpError(
      400,
      "tenant_id must be 1–50 characters: letters, numbers, _ -",
    );
  }
  const contentType =
    typeof content_type === "string" && content_type
      ? content_type
      : "application/octet-stream";

  const s3Key = `${tenant_id}/${crypto.randomUUID()}-${safeKeyName(filename)}`;

  const id = await withTransaction(async (conn) => {
    const [result] = await conn.query(
      `INSERT INTO assets (filename, asset_type, status, tenant_id, s3_bucket, s3_key, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
      [filename, asset_type, tenant_id, s3.BUCKET_NAME, s3Key],
    );
    await logEvent(
      conn,
      result.insertId,
      "created",
      `Asset created by ${req.user.username}, awaiting upload`,
    );
    return result.insertId;
  });

  const uploadUrl = await s3.getUploadUrl(s3Key, contentType);
  res.status(201).json({ id, uploadUrl, expiresIn: s3.URL_TTL_SECONDS });
});

// POST /api/assets/:id/confirm-upload : called after the browser's S3 PUT
// succeeds. Size comes from S3 itself (HeadObject), not from the client, so
// the recorded metadata can't be spoofed and we know the object really exists.
router.post(
  "/:id/confirm-upload",
  requireRole("admin", "editor"),
  async (req, res) => {
    const asset = await findAsset(req.params.id);
    if (!asset.s3_key) throw new HttpError(409, "Asset has no storage key");

    const head = await s3.headObject(asset.s3_key);
    if (!head)
      throw new HttpError(409, "File has not been uploaded to storage yet");

    await withTransaction(async (conn) => {
      await conn.query(
        `UPDATE assets SET status = 'ready', file_size = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?`,
        [head.size ?? null, asset.id],
      );
      await logEvent(
        conn,
        asset.id,
        "upload_confirmed",
        `Upload confirmed by ${req.user.username}`,
      );
    });

    res.json({ id: asset.id, status: "ready", file_size: head.size ?? null });
  },
);

// POST /api/assets/:id/upload-failed : the browser reports a failed S3 PUT,
// so the asset doesn't sit in "pending" forever.
router.post(
  "/:id/upload-failed",
  requireRole("admin", "editor"),
  async (req, res) => {
    const asset = await findAsset(req.params.id);
    if (asset.status !== "pending")
      throw new HttpError(409, `Asset is already ${asset.status}`);
    const reason =
      typeof req.body?.reason === "string"
        ? req.body.reason.slice(0, 200)
        : "unknown error";

    await withTransaction(async (conn) => {
      await conn.query(
        `UPDATE assets SET status = 'failed', updated_at = UTC_TIMESTAMP() WHERE id = ?`,
        [asset.id],
      );
      await logEvent(
        conn,
        asset.id,
        "upload_failed",
        `Upload by ${req.user.username} failed: ${reason}`,
      );
    });
    res.json({ id: asset.id, status: "failed" });
  },
);

// GET /api/assets/:id
router.get("/:id", async (req, res) => {
  res.json(await findAsset(req.params.id));
});

// GET /api/assets/:id/logs
router.get("/:id/logs", async (req, res) => {
  await findAsset(req.params.id);
  const [rows] = await pool.query(
    "SELECT * FROM ingestion_logs WHERE asset_id = ? ORDER BY created_at DESC, id DESC",
    [req.params.id],
  );
  res.json(rows);
});

// PATCH /api/assets/:id/status : editor/admin only, with an audit entry
router.patch(
  "/:id/status",
  requireRole("admin", "editor"),
  async (req, res) => {
    const { status } = req.body ?? {};
    if (!STATUSES.includes(status)) {
      throw new HttpError(400, `status must be one of ${STATUSES.join(", ")}`);
    }

    await withTransaction(async (conn) => {
      const asset = await findAsset(req.params.id, conn);
      if (asset.status === status) return;
      await conn.query(
        "UPDATE assets SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?",
        [status, asset.id],
      );
      await logEvent(
        conn,
        asset.id,
        "status_change",
        `Status changed from ${asset.status} to ${status} by ${req.user.username}`,
      );
    });

    res.json({ id: Number(req.params.id), status });
  },
);

// GET /api/assets/:id/download-url : short-lived presigned S3 GET URL
router.get("/:id/download-url", async (req, res) => {
  const asset = await findAsset(req.params.id);
  if (!asset.s3_key || asset.file_size === null) {
    throw new HttpError(404, "No file uploaded for this asset");
  }
  const url = await s3.getDownloadUrl(asset.s3_key, asset.filename);
  res.json({ url, expiresIn: s3.URL_TTL_SECONDS });
});

// DELETE /api/assets/:id : admin only.
// Delete the DB rows first (in a transaction), then the S3 object. If the DB
// step fails, nothing is lost. If the S3 step fails, we're left with an
// orphaned object, which is harmless and cleanable, rather than a DB row
// pointing at a file that no longer exists.
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const asset = await withTransaction(async (conn) => {
    const found = await findAsset(req.params.id, conn);
    // Explicit delete keeps this working on databases created before the
    // FK gained ON DELETE CASCADE.
    await conn.query("DELETE FROM ingestion_logs WHERE asset_id = ?", [
      found.id,
    ]);
    await conn.query("DELETE FROM assets WHERE id = ?", [found.id]);
    return found;
  });

  if (asset.s3_key) {
    try {
      await s3.deleteObject(asset.s3_key);
    } catch (err) {
      console.warn(
        `[assets] asset ${asset.id} deleted but S3 object ${asset.s3_key} was not:`,
        err.message,
      );
    }
  }
  res.json({ deleted: asset.id });
});

module.exports = router;
