import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export default function PageHeader({ title, description, badge, className }) {
  return (
    <div className={cn("flex flex-col gap-1 pb-6", className)}>
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        {badge !== undefined && badge !== null && (
          <Badge variant="secondary" className="px-2 py-0.5 mt-1">{badge}</Badge>
        )}
      </div>
      {description && <p className="text-base text-muted-foreground">{description}</p>}
    </div>
  );
}
