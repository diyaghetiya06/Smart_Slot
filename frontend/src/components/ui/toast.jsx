export function toastClass(variant = "default") {
  if (variant === "destructive") {
    return "border-destructive/40 bg-destructive text-destructive-foreground";
  }
  return "border-border bg-card text-card-foreground";
}
