import { apiRequest } from "@/api/client";

export function fetchReports(generationId = "") {
  const query = generationId ? `?generation_id=${encodeURIComponent(generationId)}` : "";
  return apiRequest(`/reports${query}`);
}
