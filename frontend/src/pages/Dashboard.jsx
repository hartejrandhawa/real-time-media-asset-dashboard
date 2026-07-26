import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

const STATUSES = ["pending", "processing", "ready", "failed", "archived"];
const TYPES = ["video", "audio", "image", "document"];

export default function Dashboard() {
  const [filters, setFilters] = useState({ tenant_id: "", status: "", asset_type: "" });
  const [assets, setAssets] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const canEdit = user?.role === "admin" || user?.role === "editor";

  useEffect(() => {
    load();
  }, [filters, page]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.searchAssets({ ...filters, page, pageSize: 15 });
      setAssets(res.data);
      setTotal(res.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(id, newStatus) {
    try {
      await api.updateStatus(id, newStatus);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const totalPages = Math.max(1, Math.ceil(total / 15));

  return (
    <div className="page">
      <header className="page-header">
        <h1>Media Asset Dashboard</h1>
        <div>
          <span className="username-tag">{user?.username} ({user?.role})</span>
          <button className="link-btn" onClick={handleLogout}>Log out</button>
        </div>
      </header>

      <div className="filters card">
        <input
          placeholder="Tenant ID (e.g. tenant_c)"
          value={filters.tenant_id}
          onChange={(e) => { setPage(1); setFilters({ ...filters, tenant_id: e.target.value }); }}
        />
        <select value={filters.status} onChange={(e) => { setPage(1); setFilters({ ...filters, status: e.target.value }); }}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.asset_type} onChange={(e) => { setPage(1); setFilters({ ...filters, asset_type: e.target.value }); }}>
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {error && <p className="error-text">{error}</p>}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <table className="asset-table">
            <thead>
              <tr>
                <th>Filename</th>
                <th>Type</th>
                <th>Tenant</th>
                <th>Status</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td>{a.filename}</td>
                  <td>{a.asset_type}</td>
                  <td>{a.tenant_id}</td>
                  <td>
                    {canEdit ? (
                      <select value={a.status} onChange={(e) => handleStatusChange(a.id, e.target.value)}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <span className={`status-badge status-${a.status}`}>{a.status}</span>
                    )}
                  </td>
                  <td>{new Date(a.updated_at).toLocaleString()}</td>
                  <td><Link to={`/assets/${a.id}`}>Logs</Link></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span>Page {page} of {totalPages} ({total} total)</span>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
}
