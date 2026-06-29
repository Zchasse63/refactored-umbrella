import { CameraOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/types";

const initials = (name: string) =>
  name
    .replace(/[^a-z0-9 ]/gi, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "··";

/** A product is illustrated if it has an image file we can show. The factory deck
 *  images (incl. ones with Chinese text) count — we show them as-is; real studio
 *  photos come later with samples. Only a genuinely absent image is "no photo". */
export const hasImage = (p: Product) =>
  !!p.primary_image_path && (p.photo_state === "good" || p.photo_state === "clean-photo-needed");

/** The branded "photo pending" placeholder — never a broken-image icon. */
function StudioPhotoPending({ product, className }: { product: Product; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-muted/50 text-muted-foreground",
        className,
      )}
    >
      <CameraOff className="size-6 opacity-60" aria-hidden />
      <span className="font-mono text-lg font-semibold tracking-tight text-foreground/40">
        {initials(product.name)}
      </span>
      <span className="text-[11px]">Photo pending</span>
    </div>
  );
}

/** Full product image frame (PDP / large card). Shows the deck photo as-is. */
export function PhotoFrame({
  product,
  className,
  aspect = "aspect-square",
}: {
  product: Product;
  className?: string;
  aspect?: string;
}) {
  if (!hasImage(product)) {
    return <StudioPhotoPending product={product} className={cn(aspect, "w-full", className)} />;
  }
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-lg border border-border bg-muted/30",
        aspect,
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={product.primary_image_path!}
        alt={product.name}
        className="absolute inset-0 h-full w-full object-contain p-3"
        loading="lazy"
      />
    </div>
  );
}

/** Tiny corner badge — only when there is genuinely no image to show. */
export function PhotoCornerBadge({ product }: { product: Product }) {
  if (hasImage(product)) return null;
  const label = product.photo_state === "reshoot" ? "Reshoot" : "No photo";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
      title={`Photo state: ${product.photo_state}`}
    >
      <CameraOff className="size-3" aria-hidden /> {label}
    </span>
  );
}
