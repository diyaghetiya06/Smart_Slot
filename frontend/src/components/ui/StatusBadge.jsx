import { cn } from "@/lib/utils";

export default function StatusBadge({ status, variant, className }) {
  let base = "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
  
  if (variant === "room") {
    if (status === "Available") base = "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    else if (status === "Maintenance") base = "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    else if (status === "Reserved") base = "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
  } else if (variant === "publish") {
    if (status === "Published") base = "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    else if (status === "Draft") base = "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    else if (status === "Reviewed") base = "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
  } else {
    // Defaults matching names just in case variant not strictly passed
    if (status === "Available" || status === "Published") base = "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    else if (status === "Maintenance") base = "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    else if (status === "Reserved" || status === "Reviewed") base = "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
  }

  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", base, className)}>
      {status || "Unknown"}
    </span>
  );
}
