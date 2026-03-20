import { apiUpload, apiRequest } from "@/api/client";

export function importFaculty(file) {
  const fd = new FormData();
  fd.append("file", file);
  return apiUpload("/import/faculty", fd);
}

export function importSubjects(file) {
  const fd = new FormData();
  fd.append("file", file);
  return apiUpload("/import/subjects", fd);
}

export function importDivisions(file) {
  const fd = new FormData();
  fd.append("file", file);
  return apiUpload("/import/divisions", fd);
}

export function autoRegenerate(trigger) {
  return apiRequest("/import/auto-regenerate", {
    method: "POST",
    body: JSON.stringify({ trigger }),
  });
}
