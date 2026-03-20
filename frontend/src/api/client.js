const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

function fireToast(detail) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("app-toast", { detail }));
  }
}

function getStoredToken() {
  try {
    return localStorage.getItem("smart_slot_access_token");
  } catch {
    return null;
  }
}

function handle401(response) {
  if (response.status === 401) {
    try {
      localStorage.removeItem("smart_slot_access_token");
      localStorage.removeItem("smart_slot_refresh_token");
    } catch { /* ignore */ }
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }
}

export async function apiRequest(path, options = {}) {
  const token = getStoredToken();
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { 
        "Content-Type": "application/json", 
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}) 
      },
      ...options,
    });
  } catch {
    const msg = "Cannot reach the server. Please check your connection.";
    fireToast({ title: "Connection error", description: msg, variant: "destructive" });
    throw new Error(msg);
  }

  handle401(response);

  const ct = response.headers.get("content-type") ?? "";
  const payload = ct.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    const msg = payload?.message ?? `Request failed (${response.status}).`;
    fireToast({ title: "Error", description: msg, variant: "destructive" });
    throw new Error(msg);
  }

  if (payload?.message && options.method && options.method !== "GET") {
    fireToast({ title: "Done", description: payload.message });
  }

  return payload;
}

export async function apiUpload(path, formData) {
  const token = getStoredToken();
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { 
      method: "POST", 
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData 
    });
  } catch {
    const msg = "Cannot reach the server.";
    fireToast({ title: "Connection error", description: msg, variant: "destructive" });
    throw new Error(msg);
  }
  
  handle401(response);

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const msg = payload?.message ?? "Upload failed.";
    fireToast({ title: "Upload failed", description: msg, variant: "destructive" });
    throw new Error(msg);
  }
  
  if (payload?.message) {
    fireToast({ title: "Success", description: payload.message, variant: "default" });
  }

  return payload;
}
