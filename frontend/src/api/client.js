const API_BASE = "http://localhost:3001/api";

function getToken() {
  return localStorage.getItem("token");
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  register: (data) => request("/auth/register", { method: "POST", body: data, auth: false }),
  login: (data) => request("/auth/login", { method: "POST", body: data, auth: false }),

  searchAssets: (params) => {
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v))
    ).toString();
    return request(`/assets?${query}`);
  },
  getAsset: (id) => request(`/assets/${id}`),
  updateStatus: (id, status) => request(`/assets/${id}/status`, { method: "PATCH", body: { status } }),
  getLogs: (id) => request(`/assets/${id}/logs`),

  createAsset: (data) => request("/assets", { method: "POST", body: data }),
  confirmUpload: (id, file_size) =>
    request(`/assets/${id}/confirm-upload`, { method: "POST", body: { file_size } }),
  getDownloadUrl: (id) => request(`/assets/${id}/download-url`),

  async uploadFile({ filename, asset_type, tenant_id, file }) {
    const { id, uploadUrl } = await api.createAsset({
      filename,
      asset_type,
      tenant_id,
      content_type: file.type || "application/octet-stream",
    });

    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!putRes.ok) throw new Error(`Upload to S3 failed (${putRes.status})`);

    await api.confirmUpload(id, file.size);
    return id;
  },
};
