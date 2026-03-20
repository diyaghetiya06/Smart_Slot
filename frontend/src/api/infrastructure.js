import { apiRequest } from "@/api/client";

export function fetchInfrastructure(filters = []) {
  const query = filters.length ? `?equipment=${encodeURIComponent(filters.join(","))}` : "";
  return apiRequest(`/infrastructure${query}`);
}

export function createRoom(data) {
  return apiRequest("/infrastructure", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateRoom(id, data) {
  return apiRequest(`/infrastructure/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteRoom(id) {
  return apiRequest(`/infrastructure/${id}`, {
    method: "DELETE",
  });
}
