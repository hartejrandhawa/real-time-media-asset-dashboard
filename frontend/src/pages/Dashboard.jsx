import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { canEdit, useAuth } from "../context/auth";
import { useToast } from "../context/toast";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { usePolling } from "../hooks/usePolling";
import {
  ASSET_TYPES,
  PAGE_SIZE,
  POLL_MS,
  STATUSES,
  STATUS_LABELS,
  TYPE_LABELS,
} from "../lib/constants";
import {
  formatBytes,
  formatDateTime,
  formatNumber,
  formatRelative,
} from "../lib/format";
import LiveIndicator from "../components/LiveIndicator";
import Pagination from "../components/Pagination";
import StatusMark from "../components/StatusMark";
import StatusSelect from "../components/StatusSelect";
import StatusStrip from "../components/StatusStrip";
import TypeIcon from "../components/TypeIcon";
import UploadDrawer from "../components/UploadDrawer";

const FILTER_KEYS = ["q", "tenant", "status", "type"];

export default function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const editable = canEdit(user);

  // Filters live in the URL, so the back button, reloads and shared links
  // all keep the same view.
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const type = params.get("type") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);

  // Text inputs update instantly; the URL (and the request) follow 300ms later.
  const [qInput, setQInput] = useState(params.get("q") ?? "");
  const [tenantInput, setTenantInput] = useState(params.get("tenant") ?? "");
  const q = useDebouncedValue(qInput.trim());
  const tenant = useDebouncedValue(tenantInput.trim());

  const setFilter = useCallback(
    (updates) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(updates)) {
            if (v) next.set(k, v);
            else next.delete(k);
          }
          if (!("page" in updates)) next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  useEffect(() => {
    if (
      (params.get("q") ?? "") !== q ||
      (params.get("tenant") ?? "") !== tenant
    )
      setFilter({ q, tenant });
  }, [q, tenant, params, setFilter]);

  const query = useMemo(
    () => ({
      q,
      tenant_id: tenant,
      status,
      asset_type: type,
      page,
      pageSize: PAGE_SIZE,
    }),
    [q, tenant, status, type, page],
  );

  const [list, setList] = useState(null);
  const [stats, setStats] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const requestId = useRef(0);

  // Only the newest request may update state, so a slow response for an old
  // filter can never overwrite the results of a newer one.
  const load = useCallback(
    async ({ silent = false } = {}) => {
      const id = ++requestId.current;
      if (!silent) setLoading(true);
      try {
        const [listRes, statsRes] = await Promise.all([
          api.searchAssets(query),
          api.getStats({ tenant_id: query.tenant_id }),
        ]);
        if (id !== requestId.current) return;
        setList(listRes);
        setStats(statsRes);
        setError(null);
        setUpdatedAt(Date.now());
      } catch (err) {
        if (id === requestId.current) setError(err.message);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    load();
  }, [load]);

  usePolling(() => load({ silent: true }), POLL_MS);

  // Tenant list for autocomplete: fetched once, refreshed after uploads.
  useEffect(() => {
    api.getTenants().then(setTenants, () => {});
  }, []);

  async function changeStatus(asset, next) {
    // Optimistic: update the row now, roll back if the server refuses.
    setList((l) => ({
      ...l,
      data: l.data.map((a) => (a.id === asset.id ? { ...a, status: next } : a)),
    }));
    try {
      await api.updateStatus(asset.id, next);
      toast(`${asset.filename} is now ${STATUS_LABELS[next].toLowerCase()}`);
      load({ silent: true });
    } catch (err) {
      toast(`Couldn't change status: ${err.message}`, "error");
      load({ silent: true });
    }
  }

  function clearFilters() {
    setQInput("");
    setTenantInput("");
    setParams({}, { replace: true });
  }

  const hasFilters =
    FILTER_KEYS.some((k) => params.get(k)) || qInput || tenantInput;
  const rows = list?.data ?? [];

  return (
    <div className="dashboard">
      <section className="overview" aria-labelledby="overview-title">
        <div className="overview-head">
          <div>
            <h1 id="overview-title">{tenant ? tenant : "All assets"}</h1>
            <p className="overview-sub">
              {stats ? (
                <>
                  {formatNumber(stats.total)}{" "}
                  {stats.total === 1 ? "asset" : "assets"}
                  {!tenant &&
                    tenants.length > 0 &&
                    ` across ${tenants.length} tenants`}
                  , {formatBytes(stats.totalBytes)} stored
                </>
              ) : (
                "Loading totals…"
              )}
            </p>
          </div>
          <div className="overview-actions">
            <LiveIndicator updatedAt={updatedAt} error={error} />
            {editable && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setUploadOpen(true)}
              >
                Upload asset
              </button>
            )}
          </div>
        </div>
        <StatusStrip
          stats={stats}
          active={status}
          onSelect={(s) => setFilter({ status: s })}
        />
      </section>

      <section className="assets" aria-label="Assets">
        <div className="filters">
          <div className="field field-search">
            <label htmlFor="f-q" className="visually-hidden">
              Search by filename
            </label>
            <input
              id="f-q"
              type="search"
              placeholder="Search filenames"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="f-tenant" className="visually-hidden">
              Tenant
            </label>
            <input
              id="f-tenant"
              list="tenant-options"
              placeholder="Any tenant"
              value={tenantInput}
              onChange={(e) => setTenantInput(e.target.value)}
              autoComplete="off"
            />
            <datalist id="tenant-options">
              {tenants.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="f-status" className="visually-hidden">
              Status
            </label>
            <select
              id="f-status"
              value={status}
              onChange={(e) => setFilter({ status: e.target.value })}
            >
              <option value="">Any status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-type" className="visually-hidden">
              Type
            </label>
            <select
              id="f-type"
              value={type}
              onChange={(e) => setFilter({ type: e.target.value })}
            >
              <option value="">Any type</option>
              {ASSET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          {hasFilters && (
            <button
              type="button"
              className="btn btn-quiet"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          )}
        </div>

        {error && !list && (
          <div className="notice notice-error" role="alert">
            <strong>Couldn't load assets.</strong> {error}{" "}
            <button type="button" className="link-btn" onClick={() => load()}>
              Try again
            </button>
          </div>
        )}

        <div className="table-wrap" aria-busy={loading}>
          <table className="asset-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Tenant</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">
                  Size
                </th>
                <th scope="col">Added</th>
              </tr>
            </thead>
            <tbody data-loading={(loading && list) || undefined}>
              {!list &&
                loading &&
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} className="skeleton-row" aria-hidden="true">
                    <td colSpan={5}>
                      <span
                        className="skeleton"
                        style={{ width: `${40 + ((i * 17) % 45)}%` }}
                      />
                    </td>
                  </tr>
                ))}
              {rows.map((a) => (
                <tr
                  key={a.id}
                  className={`asset-row s-${a.status}`}
                  onClick={(e) => {
                    if (!e.target.closest("a, select, button"))
                      navigate(`/assets/${a.id}`, {
                        state: { from: params.toString() },
                      });
                  }}
                >
                  <td>
                    <div className="cell-name">
                    <TypeIcon
                      type={a.asset_type}
                      title={TYPE_LABELS[a.asset_type]}
                    />
                    <Link
                      to={`/assets/${a.id}`}
                      state={{ from: params.toString() }}
                      className="asset-link"
                    >
                      {a.filename}
                    </Link>
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="tenant-tag"
                      title={`Show only ${a.tenant_id}`}
                      onClick={() => setTenantInput(a.tenant_id)}
                    >
                      {a.tenant_id}
                    </button>
                  </td>
                  <td>
                    {editable ? (
                      <StatusSelect
                        value={a.status}
                        label={`Status of ${a.filename}`}
                        onChange={(s) => changeStatus(a, s)}
                      />
                    ) : (
                      <StatusMark status={a.status} />
                    )}
                  </td>
                  <td className="num">{formatBytes(a.file_size)}</td>
                  <td>
                    <time
                      dateTime={a.created_at}
                      title={formatDateTime(a.created_at)}
                    >
                      {formatRelative(a.created_at)}
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {list && rows.length === 0 && (
            <div className="empty">
              {hasFilters ? (
                <>
                  <p>No assets match these filters.</p>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                <>
                  <p>No assets yet.</p>
                  {editable && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setUploadOpen(true)}
                    >
                      Upload the first one
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {list && list.total > 0 && (
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={list.total}
            onChange={(p) => {
              setFilter({ page: p > 1 ? String(p) : "" });
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}
      </section>

      {editable && (
        <UploadDrawer
          open={uploadOpen}
          tenants={tenants}
          defaultTenant={tenant}
          onClose={() => setUploadOpen(false)}
          onUploaded={(asset) => {
            toast(`Uploaded ${asset.filename}`);
            load({ silent: true });
            api.getTenants().then(setTenants, () => {});
          }}
        />
      )}
    </div>
  );
}
