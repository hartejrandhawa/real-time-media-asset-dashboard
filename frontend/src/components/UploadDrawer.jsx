import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { ASSET_TYPES, TYPE_LABELS } from "../lib/constants";
import { formatBytes, guessAssetType } from "../lib/format";
import TypeIcon from "./TypeIcon";

const TENANT_RE = /^[A-Za-z0-9_-]{1,50}$/;

// A native <dialog> gives us focus trapping, Escape-to-close and a backdrop
// for free, so there's no modal library to add.
export default function UploadDrawer({
  open,
  onClose,
  onUploaded,
  tenants,
  defaultTenant,
}) {
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const [file, setFile] = useState(null);
  const [assetType, setAssetType] = useState("video");
  const [tenant, setTenant] = useState(defaultTenant || "");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const uploading = progress !== null;

  useEffect(() => {
    const d = dialogRef.current;
    if (open && !d.open) {
      setError(null);
      if (defaultTenant) setTenant(defaultTenant);
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open, defaultTenant]);

  function pickFile(f) {
    if (!f) return;
    setFile(f);
    setAssetType(guessAssetType(f));
    setError(null);
  }

  function reset() {
    setFile(null);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function requestClose() {
    if (uploading) abortRef.current?.abort();
    reset();
    onClose();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return setError("Choose a file to upload.");
    if (!TENANT_RE.test(tenant))
      return setError(
        "Tenant ID can use letters, numbers, _ and - (up to 50).",
      );

    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setProgress(0);
    try {
      const result = await api.uploadFile({
        file,
        asset_type: assetType,
        tenant_id: tenant,
        onProgress: setProgress,
        signal: controller.signal,
      });
      onUploaded({ ...result, filename: file.name });
      reset();
      onClose();
    } catch (err) {
      setProgress(null);
      if (err.name !== "AbortError") setError(err.message);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="drawer"
      aria-labelledby="upload-title"
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => e.target === dialogRef.current && requestClose()}
    >
      <form className="drawer-body" onSubmit={handleSubmit}>
        <header className="drawer-head">
          <h2 id="upload-title">Upload an asset</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={requestClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <label
          className="dropzone"
          data-dragging={dragging || undefined}
          data-has-file={file ? true : undefined}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pickFile(e.dataTransfer.files[0]);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            className="visually-hidden"
            disabled={uploading}
            onChange={(e) => pickFile(e.target.files[0])}
          />
          {file ? (
            <span className="dropzone-file">
              <TypeIcon type={assetType} size={28} />
              <span>
                <strong>{file.name}</strong>
                <span className="muted">
                  {formatBytes(file.size)}
                  {file.type ? `, ${file.type}` : ""}
                </span>
              </span>
            </span>
          ) : (
            <span className="dropzone-prompt">
              <strong>Drop a file here</strong>
              <span className="muted">
                or click to choose one from your computer
              </span>
            </span>
          )}
        </label>

        <div className="field">
          <label htmlFor="upload-tenant">Tenant</label>
          <input
            id="upload-tenant"
            list="upload-tenants"
            placeholder="e.g. acme_media"
            value={tenant}
            disabled={uploading}
            onChange={(e) => setTenant(e.target.value.trim())}
            autoComplete="off"
            required
          />
          <datalist id="upload-tenants">
            {tenants.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>

        <div className="field">
          <label htmlFor="upload-type">Asset type</label>
          <select
            id="upload-type"
            value={assetType}
            disabled={uploading}
            onChange={(e) => setAssetType(e.target.value)}
          >
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <p className="hint">
            Detected from the file. Change it if it's wrong.
          </p>
        </div>

        {uploading && (
          <div
            className="progress"
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span
              className="progress-fill"
              style={{ transform: `scaleX(${progress})` }}
            />
            <span className="progress-label">
              {progress < 1
                ? `Uploading ${Math.round(progress * 100)}%`
                : "Confirming with storage…"}
            </span>
          </div>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <footer className="drawer-foot">
          <button
            type="button"
            className="btn btn-quiet"
            onClick={requestClose}
          >
            {uploading ? "Cancel upload" : "Cancel"}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={uploading || !file}
          >
            {uploading ? "Uploading…" : "Upload file"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
