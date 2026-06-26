#!/usr/bin/env python3
"""
Extract Yuno US product photos from the sell-sheet deck and pair each to the correct
product by SPATIAL position (the card's photo sits immediately left of its SKU text).

Methodical + verifiable:
  python3 scripts/extract-yuno-images.py --debug 17   # annotate one page (verify pairing)
  python3 scripts/extract-yuno-images.py --debug all  # annotate every product page
  python3 scripts/extract-yuno-images.py --extract     # write clean crops + a manifest
"""
import json, os, re, sys

import fitz  # pymupdf
import openpyxl
from PIL import Image, ImageChops, ImageFilter


def autoframe(im, pad_frac=0.10, out=560):
    """Trim the near-white border to the product, center it on a square white canvas with
    a uniform margin, scale to a consistent size, and lightly sharpen (source is low-res).
    Fixes inconsistent aspect ratios / edge-cramped products across the deck."""
    im = im.convert("RGB")
    diff = ImageChops.difference(im, Image.new("RGB", im.size, (255, 255, 255))).convert("L")
    bbox = diff.point(lambda p: 255 if p > 14 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    side = int(round(max(w, h) * (1 + 2 * pad_frac)))
    canvas = Image.new("RGB", (side, side), (255, 255, 255))
    canvas.paste(im, ((side - w) // 2, (side - h) // 2))
    if side != out:
        canvas = canvas.resize((out, out), Image.LANCZOS)
    return canvas.filter(ImageFilter.UnsharpMask(radius=1.2, percent=85, threshold=2))

PDF = os.path.expanduser("~/Downloads/Yuno Group Small Appliances May 2026.pdf")
XLSX = os.path.expanduser("~/Downloads/Yuno_RoyalStar_Product_Catalog_May2026.xlsx")
OUTDIR = "/Users/zach/Desktop/Viral Project/.playwright-mcp/yuno-recon"
CROPDIR = "/Users/zach/Desktop/Viral Project/.playwright-mcp/yuno-crops"


def slugify(s):
    s = (s or "").lower().strip()
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", s))


def load_products():
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    ws = wb["Product Catalog"]
    rows = list(ws.iter_rows(values_only=True))
    hdr = next(i for i, r in enumerate(rows) if r and "Category" in [str(c).strip() if c else c for c in r])
    H = [str(c).strip() if c else "" for c in rows[hdr]]
    ci = {h: H.index(h) for h in H}
    out = []
    for r in rows[hdr + 1:]:
        rec = str(r[ci["SKU (Recommended)"]]).strip() if r[ci["SKU (Recommended)"]] else ""
        sell = str(r[ci["SKU on Sell Sheet"]]).strip() if r[ci.get("SKU on Sell Sheet", -1)] else ""
        nm = str(r[ci["Product Name"]]).strip() if r[ci["Product Name"]] else ""
        if not rec or rec.startswith("[") or "TBD" in rec.upper():
            continue
        out.append({"rec": rec, "sell": sell, "name": nm, "slug": f"{slugify(nm)}-{slugify(rec)}"})
    return out


def sku_rect(page, p):
    """Find the on-page text rect for a product's SKU (try sell-sheet sku, then recommended)."""
    for key in (p["sell"], p["rec"]):
        if not key:
            continue
        rects = page.search_for(key)
        if rects:
            return rects[0], key
    return None, None


def product_image_rects(page):
    """Image placements that look like product photos (exclude logos/footer/icons)."""
    W, Hh = page.rect.width, page.rect.height
    out = []
    for img in page.get_images(full=True):
        xref = img[0]
        for r in page.get_image_rects(xref):
            w, h = r.width, r.height
            if w < 28 or h < 28:            # icons
                continue
            if r.y0 < 58 or r.y1 > 516:     # header / footer bands
                continue
            if w > 320 or h > 360:          # full-bleed background
                continue
            out.append((xref, fitz.Rect(r)))
    return out


# The freezer/refrigeration slides use a photo-cluster + spec-table layout instead of
# photo-left-of-SKU cards. There each photo is labelled by a caption directly below it,
# and capacity variants of one chassis share a body photo (fewer photos than SKUs).
TABLE_PAGES = {29, 30, 32}  # 0-indexed -> deck pages 30, 31, 33


def match_left(sku_r, imgs):
    """Card layout: the product photo is the image just LEFT of the SKU text."""
    cy = (sku_r.y0 + sku_r.y1) / 2
    best, bestgap = None, 1e9
    for xref, r in imgs:
        if min(sku_r.y1, r.y1) - max(sku_r.y0, r.y0) <= -8:
            continue
        if r.x1 > sku_r.x0 + 6:
            continue
        gap = sku_r.x0 - r.x1
        if gap < -6:
            continue
        score = gap + abs(cy - (r.y0 + r.y1) / 2) * 0.5
        if score < bestgap:
            best, bestgap = (xref, r), score
    return best


def all_sku_rects(page, products):
    """Every on-page occurrence (caption AND table) of each product's SKU."""
    out = []
    for p in products:
        for key in {p["sell"], p["rec"]}:
            if not key:
                continue
            for r in page.search_for(key):
                out.append((p, r, key))
    return out


def caption_below(img_rect, sku_rects):
    """Table layout: the product is the SKU caption directly BELOW the photo."""
    best, bestgap = None, 1e9
    for p, r, key in sku_rects:
        if r.y0 < img_rect.y1 - 6:                       # must sit below the photo
            continue
        if min(img_rect.x1, r.x1) - max(img_rect.x0, r.x0) < 5:  # horizontally aligned
            continue
        gap = r.y0 - img_rect.y1
        if gap > 45:                                     # caption is close below
            continue
        if gap < bestgap:
            best, bestgap = (p, r), gap
    return best


def page_matches(doc, pi, products_on_page):
    """Unified: returns [(product, img_rect, sku_rect)] for a page, layout-aware."""
    page = doc[pi]
    imgs = product_image_rects(page)
    res = []
    if pi in TABLE_PAGES:
        srects = all_sku_rects(page, products_on_page)
        for xref, ir in imgs:
            m = caption_below(ir, srects)
            if m:
                res.append((m[0], ir, m[1]))
    else:
        for p in products_on_page:
            sr, _ = sku_rect(page, p)
            if not sr:
                continue
            m = match_left(sr, imgs)
            if m:
                res.append((p, m[1], sr))
    return res


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    os.makedirs(CROPDIR, exist_ok=True)
    products = load_products()
    doc = fitz.open(PDF)

    # which products land on which page
    page_for = {}
    for p in products:
        for pi in range(len(doc)):
            r, _ = sku_rect(doc[pi], p)
            if r:
                page_for.setdefault(pi, []).append(p)
                p["_page"] = pi
                break

    mode = sys.argv[1] if len(sys.argv) > 1 else "--debug"
    arg = sys.argv[2] if len(sys.argv) > 2 else "17"

    if mode == "--debug":
        pages = sorted(page_for) if arg == "all" else [int(arg) - 1]
        for pi in pages:
            page = doc[pi]
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            dbg = fitz.open(); dpage = dbg.new_page(width=pix.width, height=pix.height)
            dpage.insert_image(dpage.rect, pixmap=pix)
            S = 2
            ms = page_matches(doc, pi, page_for.get(pi, []))
            for p, ir, sr in ms:
                dpage.draw_rect(fitz.Rect(sr.x0 * S, sr.y0 * S, sr.x1 * S, sr.y1 * S), color=(1, 0, 0), width=1.5)
                dpage.draw_rect(fitz.Rect(ir.x0 * S, ir.y0 * S, ir.x1 * S, ir.y1 * S), color=(0, 0.7, 0), width=2)
                dpage.draw_line(fitz.Point((ir.x0 + ir.x1) / 2 * S, (ir.y0 + ir.y1) / 2 * S),
                                fitz.Point((sr.x0 + sr.x1) / 2 * S, (sr.y0 + sr.y1) / 2 * S), color=(0, 0, 1), width=1)
            f = f"{OUTDIR}/match-p{pi+1}.png"
            dpage.get_pixmap(matrix=fitz.Matrix(1.4, 1.4)).save(f)
            tag = "TABLE" if pi in TABLE_PAGES else "card"
            print(f"page {pi+1} ({tag}): {len(ms)} matched / {len(page_for.get(pi, []))} skus on page -> {f}")
        return

    if mode == "--apply":
        # convert extracted crops -> web JPGs in public/, and flag the source JSON so
        # a re-seed keeps the photo (mapYunoUS reads has_photo).
        man = json.load(open(f"{CROPDIR}/manifest.json"))
        pubdir = "/Users/zach/Desktop/Viral Project/public/products/appliance"
        os.makedirs(pubdir, exist_ok=True)
        have = set()
        for m in man:
            src = f"{CROPDIR}/{m['slug']}.png"
            if not os.path.exists(src):
                continue
            im = Image.open(src).convert("RGB")
            bg = Image.new("RGB", im.size, (255, 255, 255))
            bg.paste(im)
            bg.save(f"{pubdir}/{m['slug']}.jpg", "JPEG", quality=88)
            have.add(m["slug"])
        srcjson = "/Users/zach/Desktop/Viral Project/lib/data/source/yuno_us_appliances.json"
        data = json.load(open(srcjson))
        n = 0
        for p in data["products"]:
            if p["slug"] in have:
                p["has_photo"] = True
                n += 1
        json.dump(data, open(srcjson, "w"), indent=2, ensure_ascii=False)
        print(f"wrote {len(have)} JPGs to public/products/appliance; flagged has_photo on {n} products")
        return

    if mode == "--extract":
        manifest, covered = [], set()
        for pi in sorted(page_for):
            page = doc[pi]
            for p, ir, sr in page_matches(doc, pi, page_for[pi]):
                if p["slug"] in covered:
                    continue
                # render the photo region at high DPI (WYSIWYG, handles masks/clipping), then auto-frame
                pix = page.get_pixmap(matrix=fitz.Matrix(8, 8), clip=fitz.Rect(ir))
                im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
                autoframe(im).save(f"{CROPDIR}/{p['slug']}.png")
                covered.add(p["slug"])
                manifest.append({"slug": p["slug"], "rec": p["rec"], "name": p["name"], "page": pi + 1,
                                 "layout": "table" if pi in TABLE_PAGES else "card"})
        json.dump(manifest, open(f"{CROPDIR}/manifest.json", "w"), indent=2)
        uncovered = [p["slug"] for p in products if p["slug"] not in covered]
        print(f"extracted {len(manifest)} crops; {len(uncovered)}/{len(products)} products WITHOUT a photo")
        if uncovered:
            print("NO PHOTO:", ", ".join(uncovered))
        return


if __name__ == "__main__":
    main()
