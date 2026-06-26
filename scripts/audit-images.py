#!/usr/bin/env python3
"""
Image-quality auditor (test layer L4 — the gap Playwright DOM testing can't see).
Flags product images that are clipped at the edge, off-center, lost in whitespace,
cramped, blank, or the wrong shape. Also emits a labeled contact sheet for L3 review.

    python3 scripts/audit-images.py <dir>            # audit a folder of images
    python3 scripts/audit-images.py <dir> --sheet    # + write a contact sheet
"""
import glob, os, sys
from PIL import Image, ImageChops, ImageDraw, ImageFont

DIRA = sys.argv[1] if len(sys.argv) > 1 else "/Users/zach/Desktop/Viral Project/.playwright-mcp/yuno-crops"


def content_bbox(im):
    im = im.convert("RGB")
    diff = ImageChops.difference(im, Image.new("RGB", im.size, (255, 255, 255))).convert("L")
    return diff.point(lambda p: 255 if p > 14 else 0).getbbox()


def audit_one(path):
    im = Image.open(path).convert("RGB")
    W, H = im.size
    bb = content_bbox(im)
    flags = []
    if W != H:
        flags.append("NOT_SQUARE")
    if not bb:
        return ["BLANK"], {"size": (W, H)}
    l, t, r, b = bb
    ml, mt, mr, mb = l / W, t / H, (W - r) / W, (H - b) / H
    fill = ((r - l) * (b - t)) / (W * H)
    if min(ml, mt, mr, mb) < 0.015:
        flags.append("EDGE_CLIP")
    elif min(ml, mt, mr, mb) < 0.04:
        flags.append("CRAMPED")
    if fill < 0.22:
        flags.append("TOO_SMALL")
    if abs(ml - mr) > 0.09 or abs(mt - mb) > 0.09:
        flags.append("OFF_CENTER")
    return flags, {"size": (W, H), "fill": round(fill, 2),
                   "margins": tuple(round(x, 3) for x in (ml, mt, mr, mb))}


def main():
    files = sorted(glob.glob(f"{DIRA}/*.png") + glob.glob(f"{DIRA}/*.jpg"))
    files = [f for f in files if "contact" not in os.path.basename(f)]
    if not files:
        print("no images in", DIRA); return
    bad = []
    from collections import Counter
    fc = Counter()
    for f in files:
        flags, m = audit_one(f)
        for fl in flags:
            fc[fl] += 1
        if flags:
            bad.append((os.path.basename(f), flags, m))
    print(f"Audited {len(files)} images in {DIRA}")
    print(f"Clean: {len(files)-len(bad)} | Flagged: {len(bad)}")
    if fc:
        print("By flag:", dict(fc))
    for name, flags, m in bad:
        print(f"  {','.join(flags):<28} {name}  {m}")

    if "--sheet" in sys.argv:
        # contact sheet: any flagged first, then a sample of clean
        order = [f for f in files if os.path.basename(f) in {b[0] for b in bad}]
        order += [f for f in files if f not in order][:48 - len(order)]
        cols, cell, pad = 6, 250, 26
        rows = (len(order) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * cell, rows * (cell + pad)), (245, 245, 245))
        d = ImageDraw.Draw(sheet)
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 12)
        except Exception:
            font = ImageFont.load_default()
        flagset = {b[0]: b[1] for b in bad}
        for i, f in enumerate(order):
            im = Image.open(f).convert("RGB"); im.thumbnail((cell - 8, cell - 8))
            x, y = (i % cols) * cell, (i // cols) * (cell + pad)
            sheet.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2))
            nm = os.path.basename(f)[:32]
            tag = ("⚑ " + ",".join(flagset[os.path.basename(f)])) if os.path.basename(f) in flagset else nm
            d.text((x + 3, y + cell + 2), tag[:40], fill=(180, 0, 0) if os.path.basename(f) in flagset else (0, 0, 0), font=font)
        out = f"{DIRA}/contact-sheet.png"
        sheet.save(out)
        print("contact sheet ->", out)


if __name__ == "__main__":
    main()
