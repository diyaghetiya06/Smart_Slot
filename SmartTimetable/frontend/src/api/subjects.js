import { apiRequest } from "@/api/client";

export function fetchSubjects() {
  return apiRequest("/subjects");
}

export function createSubject(data) {
  return apiRequest("/subjects", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateSubject(id, data) {
  return apiRequest(`/subjects/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteSubject(id) {
  return apiRequest(`/subjects/${id}`, {
    method: "DELETE",
  });
}
