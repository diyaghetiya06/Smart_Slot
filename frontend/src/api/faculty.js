import { apiRequest } from "@/api/client";

export function fetchFaculty() {
  return apiRequest("/faculty");
}

export function createFaculty(data) {
  return apiRequest("/faculty", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateFaculty(id, data) {
  return apiRequest(`/faculty/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteFaculty(id) {
  return apiRequest(`/faculty/${id}`, {
    method: "DELETE",
  });
}
