import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn("flex min-h-[240px] flex-col items-center justify-center rounded-lg border border-dashed border-muted-foreground/25 bg-background p-8 text-center animate-in fade-in-50", className)}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        {Icon && <Icon className="h-8 w-8 text-muted-foreground" />}
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>
      {action && (
        <Button onClick={action.onClick} variant="default" className="mt-4">
          {action.label}
        </Button>
      )}
    </div>
  );
}
