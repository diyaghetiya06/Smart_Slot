import { apiRequest } from "@/api/client";

export function fetchSearch(query) {
  return apiRequest(`/search?q=${encodeURIComponent(query)}`);
}
