import { apiRequest } from "@/api/client";

export function fetchSettings() {
  return apiRequest("/settings");
}

export function updateSettings(data) {
  return apiRequest("/settings", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}
