import { apiRequest } from "@/api/client";

export function fetchConflicts(generationId = "") {
  const query = generationId ? `?generation_id=${encodeURIComponent(generationId)}` : "";
  return apiRequest(`/conflicts${query}`);
}

export function applyConflictFix(generationId) {
  return apiRequest("/conflicts/apply-fix", {
    method: "POST",
    body: JSON.stringify({ generation_id: generationId }),
  });
}
