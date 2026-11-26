// In dev, Vite proxies /api to the Express server (see vite.config.js), so
// there's no CORS and no hard-coded host. For a deployed build, set
// VITE_API_URL to the API Gateway URL + /api.
const API_BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
const SESSION_KEY = "mad.session";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const session = {
  read() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY));
    } catch {
      return null;
    }
  },
  write(value) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(value));
  },
  clear() {
    localStorage.removeItem(SESSION_KEY);
  },
};

// Fired when the server rejects our token, so AuthProvider can sign out
// instead of leaving the UI "logged in" while every call fails.
export const SESSION_EXPIRED_EVENT = "mad:session-expired";

async function request(path, { method = "GET", body, auth = true, signal } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = auth ? session.read()?.token : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError(0, "Can't reach the server. Check that the API is running.");
  }

  const data = await res.json().catch(() => null);
  if (res.status === 401 && token) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
  return data;
}

const toQuery = (params) =>
  new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== "" && v !== null && v !== undefined)
  ).toString();

// fetch() can't report upload progress, so the S3 PUT uses XHR.
function putWithProgress(url, file, contentType, { onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ApiError(xhr.status, `Storage rejected the upload (${xhr.status})`));
    xhr.onerror = () => reject(new ApiError(0, "Network error while uploading to storage"));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(file);
  });
}

export const api = {
  register: (data) => request("/auth/register", { method: "POST", body: data, auth: false }),
  login: (data) => request("/auth/login", { method: "POST", body: data, auth: false }),

  searchAssets: (params, opts) => request(`/assets?${toQuery(params)}`, opts),
  getStats: (params, opts) => request(`/assets/stats?${toQuery(params)}`, opts),
  getTenants: (opts) => request("/assets/tenants", opts),
  getAsset: (id, opts) => request(`/assets/${id}`, opts),
  getLogs: (id, opts) => request(`/assets/${id}/logs`, opts),
  updateStatus: (id, status) => request(`/assets/${id}/status`, { method: "PATCH", body: { status } }),
  deleteAsset: (id) => request(`/assets/${id}`, { method: "DELETE" }),
  getDownloadUrl: (id) => request(`/assets/${id}/download-url`),

  // create row → PUT bytes straight to S3 → confirm. If the PUT fails, tell
  // the API so the asset is marked failed rather than stuck in "pending".
  async uploadFile({ file, asset_type, tenant_id, onProgress, signal }) {
    const contentType = file.type || "application/octet-stream";
    const { id, uploadUrl } = await request("/assets", {
      method: "POST",
      body: { filename: file.name, asset_type, tenant_id, content_type: contentType },
    });
    try {
      await putWithProgress(uploadUrl, file, contentType, { onProgress, signal });
    } catch (err) {
      const reason = err.name === "AbortError" ? "cancelled by user" : err.message;
      await request(`/assets/${id}/upload-failed`, { method: "POST", body: { reason } }).catch(() => {});
      throw err;
    }
    return request(`/assets/${id}/confirm-upload`, { method: "POST" });
  },
};
