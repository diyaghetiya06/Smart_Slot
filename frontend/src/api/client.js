const API_BASE = import.meta.env.VITE_API_BASE || "/api";

function publishToast(detail) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("app-toast", { detail }));
  }
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    const message = payload?.message || "Something went wrong. Please try again.";
    publishToast({ title: "Request failed", description: message, variant: "destructive" });
    throw new Error(message);
  }

  if (payload?.message) {
    publishToast({ title: "Success", description: payload.message, variant: "default" });
  }

  return payload;
}
