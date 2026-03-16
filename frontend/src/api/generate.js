import { apiRequest } from "@/api/client";

export function fetchGenerateOptions() {
  return apiRequest("/generate/options");
}

export function generateTimetable(data) {
  return apiRequest("/generate", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
