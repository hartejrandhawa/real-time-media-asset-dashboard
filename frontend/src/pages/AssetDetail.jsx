import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { canEdit, isAdmin, useAuth } from "../context/auth";
import { useToast } from "../context/toast";
import { usePolling } from "../hooks/usePolling";
import {
  EVENT_LABELS,
  POLL_MS,
  STATUS_LABELS,
  TYPE_LABELS,
} from "../lib/constants";
import { formatBytes, formatDateTime, formatRelative } from "../lib/format";
import StatusMark from "../components/StatusMark";
import StatusSelect from "../components/StatusSelect";
import TypeIcon from "../components/TypeIcon";

export default function AssetDetail() {
  const { assetId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = `/dashboard${location.state?.from ? `?${location.state.from}` : ""}`;

  const [asset, setAsset] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // "download" | "status" | "delete"
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, l] = await Promise.all([
        api.getAsset(assetId),
        api.getLogs(assetId),
      ]);
      setAsset(a);
      setLogs(l);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [assetId]);

  useEffect(() => {
    load();
  }, [load]);
  usePolling(load, POLL_MS);

  async function handleDownload() {
    setBusy("download");
    try {
      const { url } = await api.getDownloadUrl(assetId);
      window.location.assign(url); // presigned URL sets Content-Disposition: attachment
    } catch (err) {
      toast(`Couldn't start download: ${err.message}`, "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleStatus(next) {
    setBusy("status");
    try {
      await api.updateStatus(assetId, next);
      toast(`Status changed to ${STATUS_LABELS[next].toLowerCase()}`);
      await load();
    } catch (err) {
      toast(`Couldn't change status: ${err.message}`, "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    setBusy("delete");
    try {
      await api.deleteAsset(assetId);
      toast(`Deleted ${asset.filename}`);
      navigate(backTo);
    } catch (err) {
      toast(`Couldn't delete: ${err.message}`, "error");
      setBusy(null);
    }
  }

  if (error && !asset) {
    return (
      <div className="detail">
        <Link to={backTo} className="back-link">
          All assets
        </Link>
        <div className="notice notice-error" role="alert">
          {error.status === 404
            ? "This asset doesn't exist or was deleted."
            : `Couldn't load this asset: ${error.message}`}
        </div>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="detail" aria-busy="true">
        <span className="skeleton skeleton-title" />
        <span className="skeleton" style={{ width: "30%" }} />
      </div>
    );
  }

  const hasFile = Boolean(asset.s3_key && asset.file_size !== null);

  return (
    <div className="detail">
      <Link to={backTo} className="back-link">
        All assets
      </Link>

      <header className={`detail-head s-${asset.status}`}>
        <TypeIcon
          type={asset.asset_type}
          size={32}
          title={TYPE_LABELS[asset.asset_type]}
        />
        <div className="detail-title">
          <h1>{asset.filename}</h1>
          <p className="detail-sub">
            <StatusMark status={asset.status} />
            <span className="muted">
              in <strong>{asset.tenant_id}</strong>, updated{" "}
              {formatRelative(asset.updated_at)}
            </span>
          </p>
        </div>
      </header>

      <div className="toolbar">
        {hasFile && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleDownload}
            disabled={busy === "download"}
          >
            {busy === "download" ? "Preparing download…" : "Download file"}
          </button>
        )}
        {canEdit(user) && (
          <label className="toolbar-field">
            <span>Status</span>
            <StatusSelect
              value={asset.status}
              onChange={handleStatus}
              disabled={busy === "status"}
            />
          </label>
        )}
        {isAdmin(user) && (
          <div className="danger-zone">
            {confirmingDelete ? (
              <>
                <span className="danger-text">
                  Delete this asset and its file permanently?
                </span>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleDelete}
                  disabled={busy === "delete"}
                >
                  {busy === "delete" ? "Deleting…" : "Delete"}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Keep it
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-quiet btn-danger-quiet"
                onClick={() => setConfirmingDelete(true)}
              >
                Delete asset
              </button>
            )}
          </div>
        )}
      </div>

      <div className="detail-grid">
        <section className="panel" aria-labelledby="details-title">
          <h2 id="details-title">Details</h2>
          <dl className="meta">
            <dt>Type</dt>
            <dd>{TYPE_LABELS[asset.asset_type] ?? asset.asset_type}</dd>
            <dt>Tenant</dt>
            <dd>
              <Link
                to={`/dashboard?tenant=${encodeURIComponent(asset.tenant_id)}`}
              >
                {asset.tenant_id}
              </Link>
            </dd>
            <dt>Size</dt>
            <dd className="num">
              {asset.file_size !== null
                ? formatBytes(asset.file_size)
                : "No file yet"}
            </dd>
            <dt>Created</dt>
            <dd>{formatDateTime(asset.created_at)}</dd>
            <dt>Last updated</dt>
            <dd>{formatDateTime(asset.updated_at)}</dd>
            <dt>Storage key</dt>
            <dd className="break">{asset.s3_key ?? "Not stored in S3"}</dd>
            <dt>Asset ID</dt>
            <dd className="num">{asset.id}</dd>
          </dl>
        </section>

        <section className="panel" aria-labelledby="history-title">
          <h2 id="history-title">History</h2>
          {logs.length === 0 ? (
            <p className="muted">No events recorded yet.</p>
          ) : (
            <ol className="timeline">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className={`timeline-item ev-${log.event_type}`}
                >
                  <div className="timeline-head">
                    <strong>
                      {EVENT_LABELS[log.event_type] ?? log.event_type}
                    </strong>
                    <time
                      dateTime={log.created_at}
                      title={formatDateTime(log.created_at)}
                    >
                      {formatRelative(log.created_at)}
                    </time>
                  </div>
                  <p>{log.message}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
