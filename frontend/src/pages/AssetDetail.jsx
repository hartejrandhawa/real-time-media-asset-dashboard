import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";

export default function AssetDetail() {
  const { assetId } = useParams();
  const [asset, setAsset] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    Promise.all([api.getAsset(assetId), api.getLogs(assetId)])
      .then(([assetData, logsData]) => {
        setAsset(assetData);
        setLogs(logsData);
      })
      .catch((err) => setError(err.message));
  }, [assetId]);

  async function handleDownload() {
    setDownloading(true);
    try {
      const { url } = await api.getDownloadUrl(assetId);
      window.open(url, "_blank");
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  if (error) return <div className="page"><p className="error-text">{error}</p></div>;
  if (!asset) return <div className="page"><p>Loading...</p></div>;

  return (
    <div className="page">
      <Link to="/dashboard" className="back-link">&larr; Back to dashboard</Link>
      <h1>{asset.filename}</h1>
      <p className="members-line">{asset.asset_type} &middot; {asset.tenant_id} &middot; {asset.status}</p>
      {asset.s3_key && (
        <button onClick={handleDownload} disabled={downloading}>
          {downloading ? "Preparing download..." : "Download file"}
        </button>
      )}

      <div className="card">
        <h2>Ingestion history</h2>
        {logs.length === 0 ? (
          <p className="empty-state">No events logged yet.</p>
        ) : (
          <ul className="settlement-list">
            {logs.map((log) => (
              <li key={log.id}>
                <strong>{log.event_type}</strong> — {log.message}
                <span className="paid-by"> ({new Date(log.created_at).toLocaleString()})</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
