import { cn } from "@/lib/utils";

export default function LoadingSkeleton({ rows = 3, cols = 4, className }) {
  return (
    <div className={cn("w-full overflow-hidden rounded-md border", className)}>
      <div className="flex w-full items-center gap-4 bg-muted/50 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={`header-${i}`} className="h-4 flex-1 animate-pulse rounded bg-muted/60" />
        ))}
      </div>
      <div className="flex flex-col">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={`row-${rowIndex}`} className="flex w-full items-center gap-4 border-t px-4 py-4">
            {Array.from({ length: cols }).map((_, colIndex) => (
              <div key={`col-${rowIndex}-${colIndex}`} className="h-4 flex-1 animate-pulse rounded bg-muted/60" style={{ animationDelay: `${(rowIndex * cols + colIndex) * 50}ms` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
