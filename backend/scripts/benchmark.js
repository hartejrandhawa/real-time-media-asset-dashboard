#!/usr/bin/env node
// Measure the dashboard's main search query with and without the composite
// index idx_tenant_status_created (tenant_id, status, created_at).
//
//   npm run seed -- --rows 160000 --reset   # make a realistic dataset first
//   npm run bench
//
// Both variants run the exact same SQL; the baseline adds IGNORE INDEX for
// every secondary index on the table, so MySQL has to fall back to a full
// table scan + filesort, which is what this query did before the index existed.
const { parseArgs } = require('node:util');
const { performance } = require('node:perf_hooks');
const pool = require('../src/config/db');

const { values } = parseArgs({ options: { iterations: { type: 'string', default: '200' } } });
const ITERATIONS = Number(values.iterations);
const STATUSES = ['ready', 'processing', 'pending', 'failed', 'archived'];

const sql = (hint) => `
  SELECT id, filename, asset_type, status, tenant_id, file_size, created_at, updated_at
  FROM assets ${hint}
  WHERE tenant_id = ? AND status = ?
  ORDER BY created_at DESC
  LIMIT 20`;

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { avg: samples.reduce((s, x) => s + x, 0) / samples.length, p50: at(0.5), p95: at(0.95) };
}

async function run(label, hint, combos) {
  // Warm-up so both variants start with a warm buffer pool.
  for (const c of combos.slice(0, 10)) await pool.query(sql(hint), c);
  const samples = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const params = combos[i % combos.length];
    const t0 = performance.now();
    await pool.query(sql(hint), params);
    samples.push(performance.now() - t0);
  }
  const [[plan]] = await pool.query(`EXPLAIN ${sql(hint)}`, combos[0]);
  return { label, ...stats(samples), access: plan.type, key: plan.key ?? '(none)', rows: plan.rows, extra: plan.Extra };
}

async function main() {
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM assets');
  const [tenants] = await pool.query('SELECT DISTINCT tenant_id FROM assets');
  if (!tenants.length) throw new Error('No assets found: run `npm run seed -- --rows 160000` first');

  const combos = tenants.flatMap(({ tenant_id }) => STATUSES.map((s) => [tenant_id, s]));
  console.log(`Rows in assets: ${Number(total).toLocaleString()} · ${ITERATIONS} queries per variant\n`);

  const [indexes] = await pool.query(
    `SELECT DISTINCT INDEX_NAME AS name FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets' AND INDEX_NAME <> 'PRIMARY'`
  );
  const ignoreAll = `IGNORE INDEX (${indexes.map((i) => i.name).join(', ')})`;
  const without = await run('Full scan (no index)', ignoreAll, combos);
  const withIdx = await run('Composite index', 'FORCE INDEX (idx_tenant_status_created)', combos);

  const fmt = (n) => `${n.toFixed(2)} ms`.padStart(10);
  console.log('Variant                     avg        p50        p95     access  key');
  for (const r of [without, withIdx]) {
    console.log(`${r.label.padEnd(24)}${fmt(r.avg)} ${fmt(r.p50)} ${fmt(r.p95)}   ${String(r.access).padEnd(6)}  ${r.key}`);
  }
  const reduction = (1 - withIdx.avg / without.avg) * 100;
  console.log(`\nAverage latency reduction: ${reduction.toFixed(1)}%  (${(without.avg / withIdx.avg).toFixed(1)}x faster)`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
