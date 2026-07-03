import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/** THE canonical 220 V flag — a US-sourcing landmine chip (46/70 appliances list 220 V).
 *  Amber + bolt glyph per DESIGN_GUIDE §3.0's amber-disambiguation matrix (bolt = voltage,
 *  never confusable with Quoted's file-text or needs-photo's camera). */
export function VoltageBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="warn"
      className={cn("numeric", className)}
      title="220V input — not US-ready as-is; annotate in RFQ"
    >
      <Zap aria-hidden />
      220V
    </Badge>
  );
}
