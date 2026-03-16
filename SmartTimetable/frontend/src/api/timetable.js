import { apiRequest } from "@/api/client";

export function fetchTimetable(generationId = "") {
  const query = generationId ? `?generation_id=${encodeURIComponent(generationId)}` : "";
  return apiRequest(`/timetable${query}`);
}
