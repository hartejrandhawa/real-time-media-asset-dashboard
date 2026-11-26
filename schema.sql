CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'editor', 'viewer') NOT NULL DEFAULT 'viewer',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assets (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    asset_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    tenant_id VARCHAR(50) NOT NULL,
    file_size BIGINT,
    s3_bucket VARCHAR(255),
    s3_key VARCHAR(512),
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    -- Composite index backing the dashboard search/filter query
    -- (WHERE tenant_id = ? AND status = ? ORDER BY created_at DESC).
    -- Measure its effect with `npm run bench` in backend/.
    INDEX idx_tenant_status_created (tenant_id, status, created_at),
    -- Cross-tenant views: the default "newest first" list and the
    -- status-only filter, which can't use the tenant-led index above.
    -- file_size makes it covering for the unfiltered per-status totals.
    INDEX idx_created (created_at),
    INDEX idx_status_created (status, created_at, file_size)
);

CREATE TABLE IF NOT EXISTS ingestion_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    asset_id BIGINT NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    message TEXT,
    created_at DATETIME NOT NULL,
    INDEX idx_asset_created (asset_id, created_at),
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);
