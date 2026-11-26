#!/usr/bin/env node
// Seed demo users and synthetic assets.
//
//   npm run seed                          # demo users + 2,000 assets
//   npm run seed -- --rows 160000 --reset # benchmark-sized dataset
//
// Demo accounts are for local development only.
const { parseArgs } = require('node:util');
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');
const { ASSET_TYPES } = require('../src/constants');

const { values } = parseArgs({
  options: {
    rows: { type: 'string', default: '2000' },
    reset: { type: 'boolean', default: false },
  },
});
const ROWS = Number(values.rows);
if (!Number.isInteger(ROWS) || ROWS < 0) throw new Error('--rows must be a non-negative integer');

const DEMO_USERS = [
  { username: 'admin', password: 'admin1234', role: 'admin' },
  { username: 'editor', password: 'editor1234', role: 'editor' },
  { username: 'viewer', password: 'viewer1234', role: 'viewer' },
];

const TENANTS = ['acme_media', 'northwind', 'globex', 'initech', 'umbrella', 'stark_studios', 'wayne_ent', 'hooli'];
// Weighted so the dashboard looks like a real pipeline: mostly ready.
const STATUS_WEIGHTS = [['ready', 60], ['processing', 12], ['pending', 10], ['failed', 6], ['archived', 12]];
const NAMES = {
  video: ['promo_cut', 'interview_raw', 'launch_teaser', 'broll_city', 'webinar_rec', 'ad_spot_30s', 'trailer_final'],
  audio: ['podcast_ep', 'voiceover', 'jingle_mix', 'ambient_loop', 'interview_audio', 'sfx_pack'],
  image: ['hero_banner', 'product_shot', 'thumbnail', 'team_photo', 'social_card', 'logo_variant'],
  document: ['brand_guide', 'shot_list', 'release_form', 'script_draft', 'media_kit', 'caption_file'],
};
const EXT = { video: ['mp4', 'mov'], audio: ['wav', 'mp3'], image: ['png', 'jpg', 'webp'], document: ['pdf', 'docx', 'srt'] };
const SIZE = { video: [20e6, 2e9], audio: [1e6, 120e6], image: [80e3, 12e6], document: [20e3, 5e6] };

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const totalWeight = STATUS_WEIGHTS.reduce((s, [, w]) => s + w, 0);
function pickStatus() {
  let r = Math.random() * totalWeight;
  for (const [s, w] of STATUS_WEIGHTS) if ((r -= w) < 0) return s;
  return 'ready';
}

function fakeAsset(now) {
  const type = pick(ASSET_TYPES);
  const status = pickStatus();
  const created = new Date(now - Math.random() * 90 * 86400e3);
  const updated = new Date(Math.min(now, created.getTime() + Math.random() * 2 * 86400e3));
  const [lo, hi] = SIZE[type];
  const size = status === 'pending' ? null : Math.round(lo + Math.random() * (hi - lo));
  const name = `${pick(NAMES[type])}_${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}.${pick(EXT[type])}`;
  // Seeded rows have no real object in S3, so s3_key stays NULL.
  return [name, type, status, pick(TENANTS), size, created, updated];
}

async function main() {
  if (values.reset) {
    console.log('Resetting assets and ingestion logs…');
    await pool.query('DELETE FROM ingestion_logs');
    await pool.query('DELETE FROM assets');
  }

  for (const u of DEMO_USERS) {
    const hash = await bcrypt.hash(u.password, 10);
    await pool.query(
      `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = VALUES(role)`,
      [u.username, hash, u.role]
    );
  }
  console.log(`Demo users ready: ${DEMO_USERS.map((u) => `${u.username}/${u.password}`).join(', ')}`);

  const [[{ maxId }]] = await pool.query('SELECT COALESCE(MAX(id), 0) AS maxId FROM assets');
  const now = Date.now();
  const BATCH = 5000; // multi-row INSERTs are ~100x faster than row-at-a-time
  for (let done = 0; done < ROWS; done += BATCH) {
    const batch = Array.from({ length: Math.min(BATCH, ROWS - done) }, () => fakeAsset(now));
    await pool.query(
      'INSERT INTO assets (filename, asset_type, status, tenant_id, file_size, created_at, updated_at) VALUES ?',
      [batch]
    );
    process.stdout.write(`\rInserted ${Math.min(done + BATCH, ROWS).toLocaleString()} / ${ROWS.toLocaleString()} assets`);
  }
  if (ROWS) process.stdout.write('\n');

  // Give every seeded asset an audit trail, generated set-wise in SQL.
  await pool.query(
    `INSERT INTO ingestion_logs (asset_id, event_type, message, created_at)
     SELECT id, 'created', 'Imported by seed job', created_at FROM assets WHERE id > ?`,
    [maxId]
  );
  await pool.query(
    `INSERT INTO ingestion_logs (asset_id, event_type, message, created_at)
     SELECT id, 'status_change', CONCAT('Status changed from pending to ', status, ' by pipeline'), updated_at
     FROM assets WHERE id > ? AND status <> 'pending'`,
    [maxId]
  );

  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM assets');
  console.log(`Done. assets table now has ${Number(total).toLocaleString()} rows.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
