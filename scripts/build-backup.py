#!/usr/bin/env python3
"""Partner Excel backup — designed around how it's actually used.
Sheet 1 Overview · Sheet 2 Products & Competitors (each product sits directly above its
own competitors — no tab-switching) · Sheet 3 Catalog (full 278-product reference).
Run: python3 scripts/build-backup.py   →   ~/Desktop/Portal-Backup-<date>.xlsx
"""
import json, os, urllib.request, datetime, statistics
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.properties import PageSetupProperties

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = {}
for line in open(os.path.join(ROOT, ".env.local")):
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1); env[k.strip()] = v.strip().strip('"').strip("'")
URL, KEY = env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"]
def get(path):
    r = urllib.request.Request(URL + path, headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    return json.loads(urllib.request.urlopen(r, timeout=90).read())

SITE = "https://the-portal-sourcing.netlify.app"
prods = get("/rest/v1/products?select=id,external_ref,line,group_name,name,model,specs,our_cost&order=line,name")
comps = get("/rest/v1/competitors?status=eq.approved&select=product_id,title,brand,retail_url,price,price_avg90,price_min90,price_max90,bsr,bsr_best,est_monthly_sales,review_count,reviews_added_90d,fba_pick_pack_fee,buy_box_is_fba,listed_since")
costs = json.load(open("/tmp/fs-costs.json")) if os.path.exists("/tmp/fs-costs.json") else {}
cby = {}
for c in comps: cby.setdefault(c["product_id"], []).append(c)

INK, SLATE, MUT, LINK, BAND = "FF1F2937", "FF334155", "FF64748B", "FF2563EB", "FFF1F5F9"
HUE = {"foodservice": "FF0E7490", "appliance": "FF7C3AED", "beauty": "FFBE185D"}
TINT = {"foodservice": "FFE0F2FE", "appliance": "FFEDE9FE", "beauty": "FFFCE7F3"}
thin = Side(style="thin", color="FFE2E8F0")
def money(c): c.number_format = '"$"#,##0.00'
def num(c): c.number_format = '#,##0'
H_FILL, H_FONT = PatternFill("solid", fgColor=INK), Font(bold=True, color="FFFFFFFF", size=10)
def col_header(ws, cols, widths, row=1):
    for i, (t, w) in enumerate(zip(cols, widths), 1):
        cc = ws.cell(row=row, column=i, value=t); cc.fill = H_FILL; cc.font = H_FONT
        cc.alignment = Alignment(vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.row_dimensions[row].height = 26

def med(xs):
    xs = [x for x in xs if x is not None]
    return statistics.median(xs) if xs else None

order = {"foodservice": 0, "appliance": 1, "beauty": 2}
prods_sorted = sorted(prods, key=lambda p: (order.get(p["line"], 9), p.get("group_name") or "", p["name"]))
wb = Workbook()

# 1. Overview
ov = wb.active; ov.title = "Overview"; ov.sheet_view.showGridLines = False
ov.column_dimensions["A"].width = 2; ov.column_dimensions["B"].width = 26; ov.column_dimensions["C"].width = 70
ov["B2"] = "THE PORTAL"; ov["B2"].font = Font(bold=True, size=22, color=INK)
ov["B3"] = f"Product & Competitor Backup  ·  generated {datetime.date.today().isoformat()}"; ov["B3"].font = Font(size=11, color=MUT)
r = 5
def ov_line(label, val, bold=False, hue=None, small=False):
    global r
    a = ov.cell(row=r, column=2, value=label); a.font = Font(bold=not small, color=SLATE, size=10 if small else 11)
    b = ov.cell(row=r, column=3, value=val); b.font = Font(bold=bold, color=hue or ("FF64748B" if small else "FF0F172A"), size=10 if small else 11)
    b.alignment = Alignment(wrap_text=True, vertical="top"); r += 1
fs = [p for p in prods if p["line"] == "foodservice"]; ap = [p for p in prods if p["line"] == "appliance"]; be = [p for p in prods if p["line"] == "beauty"]
ov_line("What this is", "An offline snapshot of the Portal for reviewing and pricing products if the live site is unavailable. Each product is shown together with its own Amazon competitors — no cross-referencing needed.")
r += 1
ov_line("Live site", SITE, hue=LINK)
ov_line("Products", str(len(prods)), bold=True)
ov_line("   · Foodservice", f"{len(fs)}  —  Amazon-ready (has costs + competitor data)", hue=HUE['foodservice'])
ov_line("   · Appliances", f"{len(ap)}  —  no cost yet; partner sets a target sell to generate one", hue=HUE['appliance'])
ov_line("   · Beauty", f"{len(be)}", hue=HUE['beauty'])
ov_line("Verified competitors", f"{len(comps)} across {len(cby)} products  (every listing links to Amazon)", bold=True)
r += 1
ov_line("The tabs", "")
ov_line("   Products & Competitors", "The working view. Each product with a shaded banner (our cost + the market's median price), followed immediately by its competitors. This is where you review and price.")
ov_line("   Catalog", "The full 278-product index — line, category, specs, cost, competitor count, and a link to each product's live page.")
r += 1
ov_line("Reading a competitor row", "")
for t, d in [("Price / 90-Day Avg", "current price vs. its 90-day average"),
             ("BSR / Best BSR", "Amazon sales rank now vs. best-ever — lower = hotter"),
             ("Sold/Mo", "Keepa's estimated units sold last month"),
             ("+90d", "new reviews in the last 90 days (momentum)"),
             ("FBA Fee", "Amazon's real fulfillment fee for that listing"),
             ("Fulfillment", "whether that listing ships FBA or FBM")]:
    ov_line("   " + t, d, small=True)
r += 1
ov_line("Note on our cost", "Real Greenway quotes are shown plainly; extrapolated estimates are labeled '(estimate)' — never commit pricing on an estimate before a factory quote.", small=True)

# 2. Products & Competitors (unified working view)
rv = wb.create_sheet("Products & Competitors"); rv.sheet_view.showGridLines = False
cols = ["Listing / Product", "Price", "90-Day Avg", "90-Day Low–High", "BSR", "Best BSR", "Sold/Mo", "Reviews", "+90d", "FBA Fee", "Fulfillment", "First Listed"]
wds = [50, 10, 11, 16, 10, 10, 9, 9, 7, 9, 11, 11]
col_header(rv, cols, wds); rv.freeze_panes = "A2"; rv.print_title_rows = "1:1"
rr = 2
for p in [p for p in prods_sorted if cby.get(p["id"])]:
    grp = sorted(cby[p["id"]], key=lambda c: -(c.get("est_monthly_sales") or 0))
    m = med([float(c["price"]) for c in grp if c.get("price") is not None])
    ce = costs.get(p["external_ref"], {})
    if ce.get("cost") is not None:
        cost_txt = f"our cost ${ce['cost']:.2f} ({'real quote' if ce['kind']=='quote' else 'estimate'})"
    else:
        cost_txt = "no cost yet — set a target sell"
    banner = f"{p['name']}      {cost_txt}" + (f"   ·   market median ${m:.2f}" if m else "") + f"   ·   {len(grp)} competitor{'s' if len(grp)!=1 else ''}"
    b = rv.cell(row=rr, column=1, value=banner)
    b.font = Font(bold=True, size=11, color=INK); b.alignment = Alignment(vertical="center")
    for ci in range(1, len(cols) + 1):
        rv.cell(row=rr, column=ci).fill = PatternFill("solid", fgColor=TINT.get(p["line"], BAND))
    lk = rv.cell(row=rr, column=len(cols), value="Open ↗"); lk.hyperlink = f"{SITE}/p/{p['external_ref'].split(':')[1]}"
    lk.font = Font(color=LINK, underline="single", size=9); lk.alignment = Alignment(horizontal="right", vertical="center")
    rv.row_dimensions[rr].height = 24; rr += 1
    for c in grp:
        rng = ""
        if c.get("price_min90") is not None and c.get("price_max90") is not None:
            rng = f'${float(c["price_min90"]):.2f}–${float(c["price_max90"]):.2f}'
        vals = [c["title"], c.get("price"), c.get("price_avg90"), rng or "—", c.get("bsr"), c.get("bsr_best"),
                c.get("est_monthly_sales"), c.get("review_count"), c.get("reviews_added_90d"), c.get("fba_pick_pack_fee"),
                ("FBA" if c.get("buy_box_is_fba") else ("FBM" if c.get("buy_box_is_fba") is not None else "—")),
                (c.get("listed_since") or "")[:7] or "—"]
        for ci, v in enumerate(vals, 1):
            cc = rv.cell(row=rr, column=ci, value=float(v) if ci in (2, 3, 10) and v is not None else v)
            cc.border = Border(bottom=thin); cc.font = Font(size=10, color="FF0F172A")
            cc.alignment = Alignment(vertical="center", wrap_text=(ci == 1))
        link = rv.cell(row=rr, column=1)
        if c.get("retail_url"): link.hyperlink = c["retail_url"]; link.font = Font(color=LINK, underline="single", size=10)
        for ci in (2, 3, 10): money(rv.cell(row=rr, column=ci))
        for ci in (5, 6, 7, 8, 9): num(rv.cell(row=rr, column=ci))
        rv.cell(row=rr, column=11).alignment = Alignment(horizontal="center", vertical="center")
        rv.row_dimensions[rr].height = 30; rr += 1
    rr += 1  # spacer

# 3. Catalog (full reference)
cat = wb.create_sheet("Catalog"); cat.sheet_view.showGridLines = False
cols = ["Line", "Category", "Product", "Model", "Key Specs", "Our Cost", "Competitors", "Live Page"]
wds = [13, 22, 42, 16, 48, 12, 13, 12]
col_header(cat, cols, wds); cat.freeze_panes = "A2"; cat.print_title_rows = "1:1"
rr = 2
for p in prods_sorted:
    specs = "; ".join(f'{s["label"]}: {s["value"]}' for s in (p.get("specs") or [])[:5])
    ncomp = len(cby.get(p["id"], []))
    ce = costs.get(p["external_ref"], {})
    vals = [p["line"].title(), p.get("group_name") or "—", p["name"], p.get("model") or "—", specs,
            ce.get("cost"), ncomp if ncomp else None, None]
    for ci, v in enumerate(vals, 1):
        cc = cat.cell(row=rr, column=ci, value=v); cc.border = Border(bottom=thin)
        cc.alignment = Alignment(vertical="center", wrap_text=(ci in (3, 5)))
        cc.font = Font(size=10, color="FF0F172A")
        if rr % 2 == 0: cc.fill = PatternFill("solid", fgColor=BAND)
    cat.cell(row=rr, column=1).font = Font(size=10, bold=True, color=HUE.get(p["line"], INK))
    cc = cat.cell(row=rr, column=6); money(cc)
    if ce.get("kind") == "estimate": cc.font = Font(size=10, italic=True, color=MUT)  # estimate = muted italic
    lp = cat.cell(row=rr, column=8, value="Open ↗"); lp.hyperlink = f"{SITE}/p/{p['external_ref'].split(':')[1]}"
    lp.font = Font(color=LINK, underline="single", size=10)
    cat.row_dimensions[rr].height = 30; rr += 1
cat.auto_filter.ref = f"A1:{get_column_letter(len(cols))}{rr-1}"

# print / page setup
for ws, land in [(ov, False), (rv, True), (cat, True)]:
    ws.page_setup.orientation = "landscape" if land else "portrait"
    ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_margins.left = ws.page_margins.right = 0.3; ws.page_margins.top = ws.page_margins.bottom = 0.4

out = os.path.expanduser(f"~/Desktop/Portal-Backup-{datetime.date.today().isoformat()}.xlsx")
wb.save(out)
print("saved:", out)
print(f"products {len(prods)} | competitors {len(comps)} across {len(cby)} products")
