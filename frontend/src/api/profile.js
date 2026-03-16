import { apiRequest } from "@/api/client";

export function fetchProfile() {
  return apiRequest("/profile");
}

export function updateProfile(data) {
  return apiRequest("/profile", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}
