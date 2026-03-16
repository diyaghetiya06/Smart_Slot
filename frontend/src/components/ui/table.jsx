import { cn } from "@/lib/utils";

export function Table({ className, ...props }) {
  return <table className={cn("w-full text-sm", className)} {...props} />;
}

export function THead({ className, ...props }) {
  return <thead className={cn(className)} {...props} />;
}

export function TBody({ className, ...props }) {
  return <tbody className={cn(className)} {...props} />;
}

export function TR({ className, ...props }) {
  return <tr className={cn("border-b", className)} {...props} />;
}

export function TH({ className, ...props }) {
  return <th className={cn("p-2 text-left text-muted-foreground", className)} {...props} />;
}

export function TD({ className, ...props }) {
  return <td className={cn("p-2", className)} {...props} />;
}
