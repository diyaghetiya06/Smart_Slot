import { apiRequest } from "@/api/client";

export function fetchDashboard() {
  return apiRequest("/dashboard");
}
