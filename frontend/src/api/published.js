import { apiRequest } from "@/api/client";

export function fetchPublished(generationId = "") {
  const query = generationId ? `?generation_id=${encodeURIComponent(generationId)}` : "";
  return apiRequest(`/published${query}`);
}

export function fetchShare(generationId) {
  return apiRequest(`/share/${encodeURIComponent(generationId)}`);
}
