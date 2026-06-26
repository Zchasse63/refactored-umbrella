import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none tracking-[0.02em] [&_svg]:size-3",
  {
    variants: {
      variant: {
        neutral: "border-border bg-muted text-muted-foreground",
        outline: "border-border text-muted-foreground",
        target: "border-transparent bg-target-muted text-target-muted-foreground",
        quoted: "border-transparent bg-quoted-muted text-quoted-muted-foreground",
        actual: "border-transparent bg-actual-muted text-foreground/70",
        pass: "border-transparent bg-pass-muted text-pass-muted-foreground",
        fail: "border-transparent bg-fail-muted text-fail-muted-foreground",
        partner: "border-transparent bg-partner-muted text-partner-muted-foreground",
        warn: "border-transparent bg-quoted-muted text-quoted-muted-foreground",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
export { badgeVariants };
