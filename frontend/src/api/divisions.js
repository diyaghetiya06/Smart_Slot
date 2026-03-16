import { apiRequest } from "@/api/client";

export function fetchDivisions() {
  return apiRequest("/divisions");
}

export function createDivision(data) {
  return apiRequest("/divisions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateDivision(id, data) {
  return apiRequest(`/divisions/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteDivision(id) {
  return apiRequest(`/divisions/${id}`, {
    method: "DELETE",
  });
}
