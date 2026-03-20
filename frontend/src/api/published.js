import { apiRequest } from "@/api/client";

export function fetchPublished(generationId = "") {
  const query = generationId ? `?generation_id=${encodeURIComponent(generationId)}` : "";
  return apiRequest(`/published${query}`);
}

/** Legacy: get a share URL for a generation id. Now superseded by POST /api/share in PublishedPage. */
export function fetchShare(generationId) {
  return apiRequest(`/share/${encodeURIComponent(generationId)}`);
}
