import { cn } from "@/lib/utils";

export default function SubjectTypeBadge({ type, className }) {
  const t = type || "";
  let base = "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
  
  if (t === "Class") {
    base = "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
  } else if (t === "Lab") {
    base = "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
  } else if (t === "Tutorial") {
    base = "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
  }

  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", base, className)}>
      {type || "Unknown"}
    </span>
  );
}
