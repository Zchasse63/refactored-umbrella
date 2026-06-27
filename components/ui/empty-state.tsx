import * as React from "react";
import { cn } from "@/lib/utils";

/** Consistent empty/no-results frame — icon + message + optional inline action
 *  (e.g. "Clear filters"), so every list degrades the same considered way. */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong py-14 text-center", className)}>
      {Icon && <Icon className="size-6 text-muted-foreground/60" />}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="max-w-xs text-[12px] text-muted-foreground">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
