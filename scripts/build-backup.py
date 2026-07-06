#!/usr/bin/env python3
"""Partner Excel backup — a clean product/competitor comparison workbook.

Design (from professional analysis-spreadsheet conventions): a flat comparison table
where each product's context (name, our cost, market median) lives in FROZEN left-hand
columns merged once per product, and its competitors read left-to-right beneath with
right-aligned, decimal-aligned numbers, minimal gray borders, no gridlines, and one
purposeful cue — the lowest competitor price in each group is highlighted.

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
comps = get("/rest/v1/competitors?status=eq.approved&select=product_id,title,retail_url,price,price_avg90,bsr,est_monthly_sales,review_count,fba_pick_pack_fee,buy_box_is_fba,listed_since")
costs = json.load(open("/tmp/fs-costs.json")) if os.path.exists("/tmp/fs-costs.json") else {}
cby = {}
for c in comps: cby.setdefault(c["product_id"], []).append(c)

# palette — restrained, professional
INK, SLATE, MUT, LINK = "FF1E293B", "FF475569", "FF64748B", "FF2563EB"
HUE = {"foodservice": "FF0E7490", "appliance": "FF6D28D9", "beauty": "FFBE185D"}
BAND = "FFF8FAFC"          # alternating group band
LOWFILL = "FFDCFCE7"       # lowest-price highlight (subtle green)
GRIDL = Side(style="thin", color="FFE5E9EF")     # hairline row rule
GROUPL = Side(style="thin", color="FFCBD5E1")    # group separator (slightly darker)
def money(c): c.number_format = '"$"#,##0.00'
def intfmt(c): c.number_format = '#,##0'
H_FILL, H_FONT = PatternFill("solid", fgColor=INK), Font(bold=True, color="FFFFFFFF", size=10)
RIGHT = Alignment(horizontal="right", vertical="center")
CENTER = Alignment(horizontal="center", vertical="center")
LEFT = Alignment(horizontal="left", vertical="center", wrap_text=True)

order = {"foodservice": 0, "appliance": 1, "beauty": 2}
prods_sorted = sorted(prods, key=lambda p: (order.get(p["line"], 9), p.get("group_name") or "", p["name"]))
def med(xs):
    xs = [x for x in xs if x is not None]
    return statistics.median(xs) if xs else None

wb = Workbook()

# ═══ 1. Overview ═══════════════════════════════════════════════════
ov = wb.active; ov.title = "Overview"; ov.sheet_view.showGridLines = False
ov.column_dimensions["A"].width = 2; ov.column_dimensions["B"].width = 25; ov.column_dimensions["C"].width = 74
ov["B2"] = "THE PORTAL"; ov["B2"].font = Font(bold=True, size=22, color=INK)
ov["B3"] = f"Product & Competitor Backup   ·   {datetime.date.today().strftime('%B %-d, %Y')}"; ov["B3"].font = Font(size=11, color=MUT)
r = 5
def ov_line(label, val, bold=False, hue=None, small=False):
    global r
    a = ov.cell(row=r, column=2, value=label); a.font = Font(bold=not small, color=SLATE, size=10 if small else 11)
    b = ov.cell(row=r, column=3, value=val); b.font = Font(bold=bold, color=hue or ("FF64748B" if small else "FF0F172A"), size=10 if small else 11)
    b.alignment = Alignment(wrap_text=True, vertical="top"); r += 1
fs = [p for p in prods if p["line"] == "foodservice"]; ap = [p for p in prods if p["line"] == "appliance"]; be = [p for p in prods if p["line"] == "beauty"]
ov_line("What this is", "An offline snapshot of the Portal for reviewing and pricing products if the site is unavailable. Each product sits beside its own Amazon competitors — nothing to cross-reference.")
r += 1
ov_line("Live site", SITE, hue=LINK)
ov_line("Products", str(len(prods)), bold=True)
ov_line("   Foodservice", f"{len(fs)}   ready to sell — has costs and competitor data", hue=HUE['foodservice'])
ov_line("   Appliances", f"{len(ap)}   no cost yet — set a target sell price to generate one", hue=HUE['appliance'])
ov_line("   Beauty", f"{len(be)}", hue=HUE['beauty'])
ov_line("Competitors", f"{len(comps)} verified listings across {len(cby)} products — each links to Amazon", bold=True)
r += 1
ov_line("Tabs", "")
ov_line("   Products & Competitors", "The working view. Product, our cost, and the market's median price are pinned on the left; that product's competitors line up to the right. Lowest competitor price in each group is shaded green.")
ov_line("   Catalog", "The full 278-product index with specs, cost, competitor count, and a link to each live page.")
r += 1
ov_line("Column guide", "")
for t, d in [("Price / 90-Day Avg", "current price vs. its 90-day average"),
             ("BSR", "Amazon sales rank — lower is stronger"),
             ("Sold/Mo", "estimated units sold last month"),
             ("Reviews", "total ratings — a proxy for how entrenched a listing is"),
             ("FBA Fee", "Amazon's real per-unit fulfillment fee"),
             ("Fulfillment", "whether that listing ships FBA or FBM")]:
    ov_line("   " + t, d, small=True)

# ═══ 2. Products & Competitors ═════════════════════════════════════
rv = wb.create_sheet("Products & Competitors"); rv.sheet_view.showGridLines = False
cols = ["Product", "Our Cost", "Mkt Median", "Competitor  (click to open)", "Price", "90-Day Avg", "BSR", "Sold/Mo", "Reviews", "FBA Fee", "Fulfillment", "First Listed"]
wds = [34, 10, 11, 46, 10, 11, 10, 9, 9, 10, 12, 11]
numeric = {5, 6, 7, 8, 9, 10}
for i, (t, w) in enumerate(zip(cols, wds), 1):
    cc = rv.cell(row=1, column=i, value=t); cc.fill = H_FILL; cc.font = H_FONT
    cc.alignment = RIGHT if i in numeric else Alignment(horizontal="center" if i in (11, 12) else "left", vertical="center", wrap_text=True)
    rv.column_dimensions[get_column_letter(i)].width = w
rv.row_dimensions[1].height = 28
rv.freeze_panes = "D2"          # pin header + Product/Cost/Median
rv.print_title_rows = "1:1"
rr = 2; gi = 0
for p in [p for p in prods_sorted if cby.get(p["id"])]:
    grp = sorted(cby[p["id"]], key=lambda c: -(c.get("est_monthly_sales") or 0))
    gi += 1; band = PatternFill("solid", fgColor=BAND) if gi % 2 == 0 else None
    start = rr
    prices = [float(c["price"]) for c in grp if c.get("price") is not None]
    lowp = min(prices) if prices else None
    m = med(prices)
    ce = costs.get(p["external_ref"])
    for c in grp:
        vals = [None, None, None, c["title"], c.get("price"), c.get("price_avg90"), c.get("bsr"),
                c.get("est_monthly_sales"), c.get("review_count"), c.get("fba_pick_pack_fee"),
                ("FBA" if c.get("buy_box_is_fba") else ("FBM" if c.get("buy_box_is_fba") is not None else "—")),
                (c.get("listed_since") or "")[:7] or "—"]
        for ci, v in enumerate(vals, 1):
            cc = rv.cell(row=rr, column=ci, value=(float(v) if ci in (5, 6, 10) and v is not None else v))
            cc.font = Font(size=10, color="FF0F172A")
            cc.alignment = RIGHT if ci in numeric else (CENTER if ci in (11, 12) else LEFT)
            top = GROUPL if rr == start else None
            cc.border = Border(bottom=GRIDL, top=top)
            if band: cc.fill = band
        link = rv.cell(row=rr, column=4)
        if c.get("retail_url"): link.hyperlink = c["retail_url"]; link.font = Font(color=LINK, underline="single", size=10)
        money(rv.cell(row=rr, column=5)); money(rv.cell(row=rr, column=6)); money(rv.cell(row=rr, column=10))
        for ci in (7, 8, 9): intfmt(rv.cell(row=rr, column=ci))
        if lowp is not None and c.get("price") is not None and float(c["price"]) == lowp:
            pc = rv.cell(row=rr, column=5); pc.fill = PatternFill("solid", fgColor=LOWFILL); pc.font = Font(size=10, bold=True, color="FF065F46")
        rv.row_dimensions[rr].height = 30; rr += 1
    end = rr - 1
    # merge the pinned left block once per product
    for ci in (1, 2, 3):
        if end > start: rv.merge_cells(start_row=start, start_column=ci, end_row=end, end_column=ci)
    pc = rv.cell(row=start, column=1, value=p["name"]); pc.font = Font(size=10, bold=True, color=HUE.get(p["line"], INK)); pc.alignment = Alignment(vertical="center", wrap_text=True)
    oc = rv.cell(row=start, column=2, value=ce); oc.alignment = CENTER; money(oc); oc.font = Font(size=10, color="FF0F172A")
    mc = rv.cell(row=start, column=3, value=m); mc.alignment = CENTER; money(mc); mc.font = Font(size=10, color=SLATE)
    for ci in (1, 2, 3):  # re-apply band + group top border to the merged block
        for rw in range(start, end + 1):
            cell = rv.cell(row=rw, column=ci)
            cell.border = Border(top=GROUPL if rw == start else None, bottom=GRIDL if rw == end else None)
            if band: cell.fill = band

# ═══ 3. Catalog ════════════════════════════════════════════════════
cat = wb.create_sheet("Catalog"); cat.sheet_view.showGridLines = False
cols = ["Line", "Category", "Product", "Model", "Key Specs", "Our Cost", "Competitors", "Live Page"]
wds = [13, 22, 42, 16, 50, 11, 12, 11]
for i, (t, w) in enumerate(zip(cols, wds), 1):
    cc = cat.cell(row=1, column=i, value=t); cc.fill = H_FILL; cc.font = H_FONT
    cc.alignment = RIGHT if i in (6, 7) else Alignment(horizontal="left", vertical="center")
    cat.column_dimensions[get_column_letter(i)].width = w
cat.row_dimensions[1].height = 26; cat.freeze_panes = "A2"; cat.print_title_rows = "1:1"
rr = 2
for p in prods_sorted:
    specs = "; ".join(f'{s["label"]}: {s["value"]}' for s in (p.get("specs") or [])[:5])
    ncomp = len(cby.get(p["id"], []))
    vals = [p["line"].title(), p.get("group_name") or "—", p["name"], p.get("model") or "—", specs,
            costs.get(p["external_ref"]), ncomp if ncomp else None, None]
    for ci, v in enumerate(vals, 1):
        cc = cat.cell(row=rr, column=ci, value=v); cc.border = Border(bottom=GRIDL)
        cc.alignment = RIGHT if ci in (6, 7) else LEFT
        cc.font = Font(size=10, color="FF0F172A")
        if rr % 2 == 0: cc.fill = PatternFill("solid", fgColor=BAND)
    cat.cell(row=rr, column=1).font = Font(size=10, bold=True, color=HUE.get(p["line"], INK))
    money(cat.cell(row=rr, column=6))
    lp = cat.cell(row=rr, column=8, value="Open ↗"); lp.hyperlink = f"{SITE}/p/{p['external_ref'].split(':')[1]}"
    lp.font = Font(color=LINK, underline="single", size=10); lp.alignment = LEFT
    cat.row_dimensions[rr].height = 30; rr += 1
cat.auto_filter.ref = f"A1:{get_column_letter(len(cols))}{rr-1}"

for ws, land in [(ov, False), (rv, True), (cat, True)]:
    ws.page_setup.orientation = "landscape" if land else "portrait"
    ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_margins.left = ws.page_margins.right = 0.3; ws.page_margins.top = ws.page_margins.bottom = 0.4

out = os.path.expanduser(f"~/Desktop/Portal-Backup-{datetime.date.today().isoformat()}.xlsx")
wb.save(out)
print("saved:", out)
print(f"products {len(prods)} | competitors {len(comps)} across {len(cby)} products")
