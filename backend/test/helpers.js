// Shared setup for the integration tests. They run against the real MySQL
// and S3Mock containers from docker-compose.yml (see README), using a unique
// tenant and unique usernames so they never collide with seeded or dev data.
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const app = require("../src/app");
const pool = require("../src/config/db");

const RUN = crypto.randomBytes(3).toString("hex");
const TENANT = `test_${RUN}`;
const USERS = {
  admin: `t_admin_${RUN}`,
  editor: `t_editor_${RUN}`,
  viewer: `t_viewer_${RUN}`,
};
const PASSWORD = "test-password-123";

let server;
let baseUrl;
const tokens = {};

async function setup() {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  // Users with elevated roles can't come from /register (by design), so
  // insert them directly, the same way scripts/seed.js does.
  const hash = await bcrypt.hash(PASSWORD, 4);
  for (const [role, username] of Object.entries(USERS)) {
    await pool.query(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
      [username, hash, role],
    );
    const res = await api("POST", "/auth/login", {
      body: { username, password: PASSWORD },
    });
    tokens[role] = res.body.token;
  }
}

async function teardown() {
  await pool.query("DELETE FROM assets WHERE tenant_id = ?", [TENANT]);
  await pool.query("DELETE FROM users WHERE username LIKE ?", [`%_${RUN}`]);
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
}

// api('GET', '/assets', { as: 'viewer', query: {...}, body: {...} })
// `token` overrides `as` with a literal token; `rawBody` sends a string as-is.
async function api(method, path, { as, token, body, rawBody, query } = {}) {
  const qs = query ? `?${new URLSearchParams(query)}` : "";
  const headers = { "Content-Type": "application/json" };
  const bearer = token ?? (as && tokens[as]);
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const res = await fetch(`${baseUrl}${path}${qs}`, {
    method,
    headers,
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

// Create an asset row and upload real bytes to S3 via the presigned URL.
async function uploadAsset({
  filename = "clip.mp4",
  asset_type = "video",
  bytes = "hello world",
} = {}) {
  const created = await api("POST", "/assets", {
    as: "editor",
    body: {
      filename,
      asset_type,
      tenant_id: TENANT,
      content_type: "application/octet-stream",
    },
  });
  if (created.status !== 201)
    throw new Error(`create failed: ${JSON.stringify(created.body)}`);
  const put = await fetch(created.body.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: bytes,
  });
  if (!put.ok) throw new Error(`S3 PUT failed: ${put.status}`);
  return created.body;
}

module.exports = {
  tokens,
  setup,
  teardown,
  api,
  uploadAsset,
  pool,
  TENANT,
  USERS,
  PASSWORD,
  RUN,
};
