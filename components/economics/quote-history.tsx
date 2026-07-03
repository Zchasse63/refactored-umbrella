import { getQuoteHistory } from "@/lib/data/queries";
import { Badge } from "@/components/ui/badge";
import { cn, money, int, EMDASH } from "@/lib/utils";

// quote_date is a bare date column ("YYYY-MM-DD") — format in UTC so the day never
// drifts with the server's timezone.
const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
function fmtDate(d: string | null): string {
  if (!d) return EMDASH;
  const t = Date.parse(d);
  return Number.isNaN(t) ? EMDASH : dateFmt.format(t);
}

/** Factory-quote revision history for the Deal Panel — every quote the owner has
 *  entered, newest first, with the live ("Selected") one flagged. Renders nothing
 *  until the first quote exists. Server component: fetches its own rows. */
export async function QuoteHistory({ productRef }: { productRef: string }) {
  const quotes = await getQuoteHistory(productRef);
  if (quotes.length === 0) return null;

  return (
    <div className="mt-3 border-t border-border pt-2.5">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold">Quote history</span>
        <span className="numeric text-[10px] text-muted-foreground">
          {quotes.length} {quotes.length === 1 ? "quote" : "revisions"}
        </span>
      </div>
      <ul className="space-y-1">
        {quotes.map((q) => (
          <li
            key={q.id}
            className={cn(
              "rounded-md border px-2 py-1.5",
              q.is_selected ? "border-quoted/40 bg-quoted-muted/40" : "border-border",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="numeric text-[12px] font-semibold">
                {money(q.landed_cost_ddp)} <span className="font-normal text-muted-foreground">DDP</span>
              </span>
              <span className="flex items-baseline gap-1.5">
                {q.is_selected && <Badge variant="quoted" className="text-[9px]">Selected</Badge>}
                <span className="numeric text-[10px] text-muted-foreground">{fmtDate(q.quote_date)}</span>
              </span>
            </div>
            <div className="numeric mt-0.5 flex flex-wrap items-baseline gap-x-3 text-[10px] text-muted-foreground">
              <span>MOQ {q.moq == null ? EMDASH : int(q.moq)}</span>
              <span>{q.lead_time_days == null ? `${EMDASH} lead` : `${q.lead_time_days}d lead`}</span>
              {q.supplier && <span className="min-w-0 truncate font-sans">{q.supplier}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
