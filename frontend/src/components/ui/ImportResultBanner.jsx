import { CheckCircle2, X, RefreshCw, AlertTriangle } from "lucide-react";

/**
 * Shows import result: success count, skipped rows with errors, auto-regen info.
 * Props:
 *   result    — { imported_count, skipped_count, errors: [], regenerated, generation_id }
 *   onDismiss — function
 */
export default function ImportResultBanner({ result, onDismiss }) {
  if (!result) return null;

  const { imported_count = 0, skipped_count = 0, errors = [], regenerated, generation_id } = result;

  return (
    <div className="relative rounded-xl border bg-card p-4 shadow-sm space-y-3">
      {/* Dismiss button */}
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Success row */}
      <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <p className="text-sm font-medium">
          Imported {imported_count} record{imported_count !== 1 ? "s" : ""} successfully
        </p>
      </div>

      {/* Skipped rows */}
      {skipped_count > 0 && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 space-y-2">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <p className="text-sm font-semibold">Skipped {skipped_count} row{skipped_count !== 1 ? "s" : ""}</p>
          </div>
          {errors.length > 0 && (
            <ul className="space-y-0.5 pl-6 list-disc text-xs text-amber-700 dark:text-amber-400">
              {errors.map((err, i) => (
                <li key={i}>
                  Row {err.row}: {err.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Auto-regen info */}
      {regenerated && generation_id && (
        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
          <RefreshCw className="h-4 w-4 shrink-0" />
          <p className="text-sm">
            Timetable automatically updated —{" "}
            <a
              href={`/timetable?generation_id=${generation_id}`}
              className="underline font-medium hover:opacity-80"
            >
              View Timetable
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
