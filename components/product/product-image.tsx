import { Camera, CameraOff, Languages } from "lucide-react";
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

const hasImage = (p: Product) =>
  p.primary_image_path && (p.photo_state === "good" || p.photo_state === "clean-photo-needed");

/** The branded "Studio photo pending" placeholder — never a broken-image icon. */
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
      <span className="text-[11px]">Studio photo pending</span>
    </div>
  );
}

/** Full product image frame (PDP / large card). Honest about photo quality. */
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
      <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
        {product.photo_state === "clean-photo-needed" && (
          <span className="inline-flex items-center gap-1 rounded-md bg-quoted-muted px-2 py-0.5 text-[10px] font-semibold text-quoted-muted-foreground">
            <Camera className="size-3" aria-hidden /> Clean photo needed
          </span>
        )}
        {product.image_has_chinese && (
          <span className="inline-flex items-center gap-1 rounded-md bg-background/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground backdrop-blur">
            <Languages className="size-3" aria-hidden /> Contains Chinese text
          </span>
        )}
      </div>
    </div>
  );
}

/** Tiny corner badge for catalog cards. */
export function PhotoCornerBadge({ product }: { product: Product }) {
  if (product.photo_state === "good") return null;
  const label =
    product.photo_state === "missing"
      ? "No photo"
      : product.photo_state === "reshoot"
        ? "Reshoot"
        : "Clean photo";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-quoted-muted px-1.5 py-0.5 text-[10px] font-semibold text-quoted-muted-foreground"
      title={`Photo state: ${product.photo_state}`}
    >
      <CameraOff className="size-3" aria-hidden /> {label}
    </span>
  );
}
