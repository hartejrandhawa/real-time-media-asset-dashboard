const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const {
  setup,
  teardown,
  api,
  uploadAsset,
  pool,
  TENANT,
  USERS,
  PASSWORD,
  RUN,
  tokens,
} = require("./helpers");

before(setup);
after(teardown);

describe("health", () => {
  it("reports the database as reachable", async () => {
    const res = await api("GET", "/health");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: "ok", db: "ok" });
  });

  it("returns JSON 404 for unknown API routes", async () => {
    const res = await api("GET", "/nope");
    assert.equal(res.status, 404);
    assert.equal(res.body.error, "Not found");
  });
});

describe("auth", () => {
  it("registers new users as viewers even if they ask for admin", async () => {
    const username = `t_reg_${RUN}`;
    const res = await api("POST", "/auth/register", {
      body: { username, password: "longenough1", role: "admin" },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.role, "viewer");
    const [[row]] = await pool.query(
      "SELECT role FROM users WHERE username = ?",
      [username],
    );
    assert.equal(row.role, "viewer");
  });

  it("rejects duplicate usernames with 409", async () => {
    const res = await api("POST", "/auth/register", {
      body: { username: USERS.viewer, password: "longenough1" },
    });
    assert.equal(res.status, 409);
  });

  it("validates username and password", async () => {
    const short = await api("POST", "/auth/register", {
      body: { username: `t_x_${RUN}`, password: "short" },
    });
    assert.equal(short.status, 400);
    const badName = await api("POST", "/auth/register", {
      body: { username: "a b", password: "longenough1" },
    });
    assert.equal(badName.status, 400);
  });

  it("logs in with correct credentials and rejects wrong ones", async () => {
    const ok = await api("POST", "/auth/login", {
      body: { username: USERS.editor, password: PASSWORD },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.role, "editor");
    assert.ok(ok.body.token);

    const bad = await api("POST", "/auth/login", {
      body: { username: USERS.editor, password: "wrong-password" },
    });
    assert.equal(bad.status, 401);
    const unknown = await api("POST", "/auth/login", {
      body: { username: "nobody_here", password: "x" },
    });
    assert.equal(unknown.status, 401);
    assert.equal(
      bad.body.error,
      unknown.body.error,
      "must not reveal whether a username exists",
    );
  });

  it("returns the current user from /me", async () => {
    const res = await api("GET", "/auth/me", { as: "admin" });
    assert.deepEqual(res.body, { username: USERS.admin, role: "admin" });
  });

  it("returns 400, not 500, for malformed JSON or a missing body", async () => {
    const malformed = await api("POST", "/auth/login", {
      rawBody: "{bad json",
    });
    assert.equal(malformed.status, 400);
    const empty = await api("POST", "/auth/login");
    assert.equal(empty.status, 400);
  });
});

describe("authorization", () => {
  it("requires a token for asset routes", async () => {
    const res = await api("GET", "/assets");
    assert.equal(res.status, 401);
  });

  it("rejects a token whose payload was tampered with", async () => {
    // Swap the payload for one claiming admin, keeping the original signature.
    const [header, , signature] = tokens.viewer.split(".");
    const forged = Buffer.from(
      JSON.stringify({ id: 1, username: "x", role: "admin" }),
    ).toString("base64url");
    const r = await api("GET", "/assets", {
      token: `${header}.${forged}.${signature}`,
    });
    assert.equal(r.status, 401);
  });

  it("forbids viewers from creating assets or changing status", async () => {
    const create = await api("POST", "/assets", {
      as: "viewer",
      body: { filename: "a.mp4", asset_type: "video", tenant_id: TENANT },
    });
    assert.equal(create.status, 403);
  });

  it("forbids editors from deleting assets", async () => {
    const { id } = await uploadAsset();
    const res = await api("DELETE", `/assets/${id}`, { as: "editor" });
    assert.equal(res.status, 403);
  });
});

describe("asset creation validation", () => {
  it("rejects unknown asset types and bad tenant ids", async () => {
    const badType = await api("POST", "/assets", {
      as: "editor",
      body: { filename: "a.mp4", asset_type: "hologram", tenant_id: TENANT },
    });
    assert.equal(badType.status, 400);
    const badTenant = await api("POST", "/assets", {
      as: "editor",
      body: {
        filename: "a.mp4",
        asset_type: "video",
        tenant_id: "has spaces/slash",
      },
    });
    assert.equal(badTenant.status, 400);
  });

  it("strips path components and sanitises the S3 key", async () => {
    const res = await api("POST", "/assets", {
      as: "editor",
      body: {
        filename: "../../etc/my clip (1).mp4",
        asset_type: "video",
        tenant_id: TENANT,
      },
    });
    assert.equal(res.status, 201);
    const asset = await api("GET", `/assets/${res.body.id}`, { as: "viewer" });
    assert.equal(asset.body.filename, "my clip (1).mp4");
    assert.match(
      asset.body.s3_key,
      new RegExp(`^${TENANT}/[0-9a-f-]{36}-my_clip_1_.mp4$`),
    );
  });
});

describe("upload flow (presigned S3)", () => {
  it("create → PUT to S3 → confirm records the real size from S3", async () => {
    const bytes = "x".repeat(1234);
    const { id, uploadUrl, expiresIn } = await uploadAsset({ bytes });
    assert.match(uploadUrl, /X-Amz-Signature=/);
    assert.equal(expiresIn, 300);

    // Client-supplied size is ignored: the server asks S3.
    const confirm = await api("POST", `/assets/${id}/confirm-upload`, {
      as: "editor",
      body: { file_size: 999999 },
    });
    assert.equal(confirm.status, 200);
    assert.equal(confirm.body.file_size, 1234);

    const asset = await api("GET", `/assets/${id}`, { as: "viewer" });
    assert.equal(asset.body.status, "ready");
    assert.equal(Number(asset.body.file_size), 1234);

    const dl = await api("GET", `/assets/${id}/download-url`, { as: "viewer" });
    assert.equal(dl.status, 200);
    const file = await fetch(dl.body.url);
    assert.equal(await file.text(), bytes);
    assert.match(file.headers.get("content-disposition") ?? "", /clip\.mp4/);

    const logs = await api("GET", `/assets/${id}/logs`, { as: "viewer" });
    assert.deepEqual(
      logs.body.map((l) => l.event_type),
      ["upload_confirmed", "created"],
    );
  });

  it("refuses to confirm when nothing was uploaded", async () => {
    const created = await api("POST", "/assets", {
      as: "editor",
      body: { filename: "ghost.mp4", asset_type: "video", tenant_id: TENANT },
    });
    const res = await api("POST", `/assets/${created.body.id}/confirm-upload`, {
      as: "editor",
    });
    assert.equal(res.status, 409);
    const dl = await api("GET", `/assets/${created.body.id}/download-url`, {
      as: "viewer",
    });
    assert.equal(dl.status, 404);
  });

  it("marks a pending asset failed when the browser reports an upload error", async () => {
    const created = await api("POST", "/assets", {
      as: "editor",
      body: { filename: "broken.mp4", asset_type: "video", tenant_id: TENANT },
    });
    const res = await api("POST", `/assets/${created.body.id}/upload-failed`, {
      as: "editor",
      body: { reason: "network error" },
    });
    assert.equal(res.status, 200);
    const asset = await api("GET", `/assets/${created.body.id}`, {
      as: "viewer",
    });
    assert.equal(asset.body.status, "failed");
    const again = await api(
      "POST",
      `/assets/${created.body.id}/upload-failed`,
      { as: "editor" },
    );
    assert.equal(again.status, 409);
  });
});

describe("search, stats and status changes", () => {
  const STATS_TENANT = TENANT;

  it("filters by tenant, status, type and filename, with pagination", async () => {
    // Insert a known set directly for deterministic counts.
    const rows = [];
    for (let i = 0; i < 7; i++)
      rows.push([
        `search_${i}.png`,
        "image",
        "ready",
        `${STATS_TENANT}_s`,
        100,
        new Date(Date.now() - i * 1000),
        new Date(),
      ]);
    for (let i = 0; i < 3; i++)
      rows.push([
        `other_${i}.wav`,
        "audio",
        "failed",
        `${STATS_TENANT}_s`,
        50,
        new Date(),
        new Date(),
      ]);
    await pool.query(
      "INSERT INTO assets (filename, asset_type, status, tenant_id, file_size, created_at, updated_at) VALUES ?",
      [rows],
    );
    try {
      const t = `${STATS_TENANT}_s`;
      const all = await api("GET", "/assets", {
        as: "viewer",
        query: { tenant_id: t },
      });
      assert.equal(all.body.total, 10);

      const page2 = await api("GET", "/assets", {
        as: "viewer",
        query: { tenant_id: t, status: "ready", pageSize: 5, page: 2 },
      });
      assert.equal(page2.body.total, 7);
      assert.equal(page2.body.data.length, 2);
      assert.equal(page2.body.page, 2);
      // newest first: page 2 holds the oldest two
      assert.deepEqual(
        page2.body.data.map((a) => a.filename),
        ["search_5.png", "search_6.png"],
      );

      const byType = await api("GET", "/assets", {
        as: "viewer",
        query: { tenant_id: t, asset_type: "audio" },
      });
      assert.equal(byType.body.total, 3);

      const byName = await api("GET", "/assets", {
        as: "viewer",
        query: { tenant_id: t, q: "search_3" },
      });
      assert.equal(byName.body.total, 1);

      const wildcard = await api("GET", "/assets", {
        as: "viewer",
        query: { tenant_id: t, q: "%" },
      });
      assert.equal(wildcard.body.total, 0, "LIKE wildcards must be escaped");

      const junkPage = await api("GET", "/assets", {
        as: "viewer",
        query: { tenant_id: t, page: "abc", pageSize: "9999" },
      });
      assert.equal(junkPage.body.page, 1);
      assert.equal(junkPage.body.pageSize, 100);

      const stats = await api("GET", "/assets/stats", {
        as: "viewer",
        query: { tenant_id: t },
      });
      assert.equal(stats.body.total, 10);
      assert.equal(stats.body.byStatus.ready, 7);
      assert.equal(stats.body.byStatus.failed, 3);
      assert.equal(stats.body.byStatus.pending, 0);
      assert.equal(stats.body.totalBytes, 7 * 100 + 3 * 50);

      const tenants = await api("GET", "/assets/tenants", { as: "viewer" });
      assert.ok(tenants.body.includes(t));
    } finally {
      await pool.query("DELETE FROM assets WHERE tenant_id = ?", [
        `${STATS_TENANT}_s`,
      ]);
    }
  });

  it("changes status, writes an audit entry, and validates input", async () => {
    const { id } = await uploadAsset();
    const res = await api("PATCH", `/assets/${id}/status`, {
      as: "editor",
      body: { status: "processing" },
    });
    assert.equal(res.status, 200);

    const logs = await api("GET", `/assets/${id}/logs`, { as: "viewer" });
    assert.equal(logs.body[0].event_type, "status_change");
    assert.match(
      logs.body[0].message,
      /from pending to processing by t_editor_/,
    );

    const bad = await api("PATCH", `/assets/${id}/status`, {
      as: "editor",
      body: { status: "exploded" },
    });
    assert.equal(bad.status, 400);
    const viewer = await api("PATCH", `/assets/${id}/status`, {
      as: "viewer",
      body: { status: "ready" },
    });
    assert.equal(viewer.status, 403);
    const missing = await api("PATCH", "/assets/999999999/status", {
      as: "editor",
      body: { status: "ready" },
    });
    assert.equal(missing.status, 404);
  });

  it("returns 404 for missing or non-numeric ids without leaking errors", async () => {
    const missing = await api("GET", "/assets/999999999", { as: "viewer" });
    assert.equal(missing.status, 404);
    const junk = await api("GET", "/assets/abc", { as: "viewer" });
    assert.equal(junk.status, 404);
    assert.equal(junk.body.detail, undefined);
  });
});

describe("delete", () => {
  it("admin delete removes the row, its logs, and the S3 object", async () => {
    const { id } = await uploadAsset({ bytes: "to be deleted" });
    await api("POST", `/assets/${id}/confirm-upload`, { as: "editor" });
    const dl = await api("GET", `/assets/${id}/download-url`, { as: "viewer" });

    const res = await api("DELETE", `/assets/${id}`, { as: "admin" });
    assert.equal(res.status, 200);
    assert.equal(res.body.deleted, id);

    assert.equal(
      (await api("GET", `/assets/${id}`, { as: "viewer" })).status,
      404,
    );
    const [[{ n }]] = await pool.query(
      "SELECT COUNT(*) AS n FROM ingestion_logs WHERE asset_id = ?",
      [id],
    );
    assert.equal(Number(n), 0);
    const gone = await fetch(dl.body.url);
    assert.equal(gone.status, 404, "S3 object should be deleted");
  });

  it("returns 404 when deleting an asset that does not exist", async () => {
    const res = await api("DELETE", "/assets/999999999", { as: "admin" });
    assert.equal(res.status, 404);
  });
});
