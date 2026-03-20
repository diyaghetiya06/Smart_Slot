/**
 * Colored badge for room status values.
 * Available → green  |  Maintenance → amber  |  Reserved → blue
 */
export default function RoomStatusBadge({ status }) {
  const styles = {
    Available: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    Maintenance: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    Reserved: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  };

  const cls = styles[status] ?? "bg-muted text-muted-foreground";

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {status || "Unknown"}
    </span>
  );
}
