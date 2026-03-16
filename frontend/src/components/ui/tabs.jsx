import { useState } from "react";
import { cn } from "@/lib/utils";

export function Tabs({ items, defaultValue, onChange }) {
  const [active, setActive] = useState(defaultValue || items[0]?.value || "");

  const choose = (value) => {
    setActive(value);
    if (onChange) onChange(value);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => choose(item.value)}
          className={cn(
            "rounded-md border px-3 py-1.5 text-sm",
            active === item.value ? "bg-primary text-primary-foreground" : "bg-background"
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
