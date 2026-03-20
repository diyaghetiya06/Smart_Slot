import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatGenerationId(id) {
  if (!id) return id;
  const match = id.match(/^GEN-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!match) return id;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
  if (isNaN(date.getTime())) return id;
  return `Generated on ${date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })} at ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
}

export function formatDate(isoString) {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(isoString) {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "—";
  const datePart = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const timePart = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${datePart} at ${timePart}`;
}

export function formatRelativeTime(isoString) {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "—";
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) {
    return "Just now";
  } else if (diffMin < 60) {
    return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  } else if (diffHour < 24) {
    return `${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;
  } else {
    return formatDate(isoString);
  }
}

export function formatAvailability(str) {
  if (!str) return "—";
  return str
    .split(",")
    .map(range => range.trim().replace(/-/g, " – "))
    .join(" · ");
}

export function formatSemester(num) {
  if (num === null || num === undefined || num === "") return "—";
  return `Semester ${num}`;
}

export function formatProgram(str) {
  if (!str) return "—";
  const s = str.toUpperCase();
  if (s === "UG") return "Undergraduate";
  if (s === "PG") return "Postgraduate";
  return str;
}

export function formatCapacity(num) {
  if (num === null || num === undefined) return "—";
  return `${num} students`;
}

export function formatMaxLectures(num) {
  if (num === null || num === undefined) return "—";
  return `${num} per day`;
}

export function formatBoolean(val) {
  if (val === null || val === undefined) return "—";
  return val ? "Yes" : "No";
}

export function formatCount(num, singular, plural) {
  if (num === null || num === undefined) return "—";
  return `${num} ${num === 1 ? singular : plural}`;
}
