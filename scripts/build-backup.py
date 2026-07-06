#!/usr/bin/env python3
"""Partner Excel backup — product/competitor comparison with an honest deal calculator.

Only fees we actually KNOW are baked in: our Greenway cost (+7% buffer), Amazon's 15%
referral, and the real Keepa FBA fee. "Other Fees" is left blank for the partner to add
ads / returns / storage. Net and Margin are live formulas. Each product's economics is
pinned in frozen left columns merged once per product; its competitors read to the right.

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
COST_BUFFER = 1.07   # 7% padding over the Greenway cost (freight / prep / variance)
REFERRAL = 0.15      # Amazon referral fee, this category
prods = get("/rest/v1/products?select=id,external_ref,line,group_name,name,model,specs,our_cost&order=line,name")
comps = get("/rest/v1/competitors?status=eq.approved&select=product_id,title,retail_url,price,bsr,est_monthly_sales,review_count,fba_pick_pack_fee&order=est_monthly_sales.desc")
costs = json.load(open("/tmp/fs-costs.json")) if os.path.exists("/tmp/fs-costs.json") else {}
cby = {}
for c in comps: cby.setdefault(c["product_id"], []).append(c)

INK, SLATE, MUT, LINK = "FF1E293B", "FF475569", "FF64748B", "FF2563EB"
HUE = {"foodservice": "FF0E7490", "appliance": "FF6D28D9", "beauty": "FFBE185D"}
BAND = "FFEDF2F8"
LOWFILL = "FFCFF7E0"
GRIDL = Side(style="thin", color="FFDCE2EA")
GROUPL = Side(style="medium", color="FF8DA0B6")
VDIV = Side(style="medium", color="FF8DA0B6")
def money(c): c.number_format = '"$"#,##0.00'
def intfmt(c): c.number_format = '#,##0'
H_FILL, H_FONT = PatternFill("solid", fgColor=INK), Font(bold=True, color="FFFFFFFF", size=10)
RIGHT = Alignment(horizontal="right", vertical="center")
CENTER = Alignment(horizontal="center", vertical="center")
LEFT = Alignment(horizontal="left", vertical="center", wrap_text=True)
def med(xs):
    xs = [x for x in xs if x is not None]
    return statistics.median(xs) if xs else None

order = {"foodservice": 0, "appliance": 1, "beauty": 2}
prods_sorted = sorted(prods, key=lambda p: (order.get(p["line"], 9), p.get("group_name") or "", p["name"]))
wb = Workbook()

# ═══ 1. Products & Competitors ═════════════════════════════════════
rv = wb.active; rv.title = "Products & Competitors"; rv.sheet_view.showGridLines = False
cols = ["Product", "Our Cost", "Target Sell", "Referral 15%", "FBA Fee", "Other Fees", "Net / Unit", "Margin",
        "Competitor  (click to open)", "Price", "BSR", "Sold/Mo", "Reviews", "Their FBA"]
wds = [30, 10, 11, 10, 9, 10, 10, 9, 40, 9, 9, 8, 8, 9]
right_num = {2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14}
for i, (t, w) in enumerate(zip(cols, wds), 1):
    cc = rv.cell(row=1, column=i, value=t); cc.fill = H_FILL; cc.font = H_FONT
    cc.alignment = Alignment(horizontal="right" if i in right_num else "left", vertical="center", wrap_text=True)
    rv.column_dimensions[get_column_letter(i)].width = w
rv.row_dimensions[1].height = 40
rv.freeze_panes = "I2"          # pin header + the economics block
rv.print_title_rows = "1:1"
rr = 2; gi = 0
for p in [p for p in prods_sorted if cby.get(p["id"])]:
    grp = sorted(cby[p["id"]], key=lambda c: -(c.get("est_monthly_sales") or 0))
    gi += 1; band = PatternFill("solid", fgColor=BAND) if gi % 2 == 0 else None
    start = rr
    prices = [float(c["price"]) for c in grp if c.get("price") is not None]
    lowp = min(prices) if prices else None
    m = med(prices)
    fba = med([float(c["fba_pick_pack_fee"]) for c in grp if c.get("fba_pick_pack_fee") is not None])
    base = costs.get(p["external_ref"])
    for c in grp:                   # competitors → columns 9-14
        cvals = [c["title"], c.get("price"), c.get("bsr"), c.get("est_monthly_sales"), c.get("review_count"), c.get("fba_pick_pack_fee")]
        for j, v in enumerate(cvals):
            ci = 9 + j
            cc = rv.cell(row=rr, column=ci, value=(float(v) if ci in (10, 14) and v is not None else v))
            cc.font = Font(size=10, color="FF0F172A")
            cc.alignment = LEFT if ci == 9 else RIGHT
            cc.border = Border(bottom=GRIDL, top=(GROUPL if rr == start else None))
            if band: cc.fill = band
        link = rv.cell(row=rr, column=9)
        if c.get("retail_url"): link.hyperlink = c["retail_url"]; link.font = Font(color=LINK, underline="single", size=10)
        money(rv.cell(row=rr, column=10)); money(rv.cell(row=rr, column=14))
        for ci in (11, 12, 13): intfmt(rv.cell(row=rr, column=ci))
        if lowp is not None and c.get("price") is not None and float(c["price"]) == lowp:
            pc = rv.cell(row=rr, column=10); pc.fill = PatternFill("solid", fgColor=LOWFILL); pc.font = Font(size=10, bold=True, color="FF065F46")
        rv.row_dimensions[rr].height = 32; rr += 1
    end = rr - 1
    for ci in range(1, 9):          # merge the economics block once per product
        if end > start: rv.merge_cells(start_row=start, start_column=ci, end_row=end, end_column=ci)
    pc = rv.cell(row=start, column=1, value=p["name"]); pc.font = Font(size=11, bold=True, color=HUE.get(p["line"], INK)); pc.alignment = Alignment(vertical="center", wrap_text=True)
    if base is not None:            # live deal math — only known fees (cost+7%, referral, real FBA); partner adds Other
        padded = round(base * COST_BUFFER, 2)
        Cs, Bs, Ds, Es, Fs, Gs = f"C{start}", f"B{start}", f"D{start}", f"E{start}", f"F{start}", f"G{start}"
        rv.cell(row=start, column=2, value=padded)                          # our cost + 7% buffer
        rv.cell(row=start, column=3, value=round(m, 2) if m else None)      # target sell (editable)
        rv.cell(row=start, column=4, value=f"={REFERRAL}*{Cs}")            # referral 15%
        rv.cell(row=start, column=5, value=round(fba, 2) if fba else None)  # FBA (Keepa median)
        # column 6 (Other Fees) left blank for the partner
        rv.cell(row=start, column=7, value=f"={Cs}-{Bs}-{Ds}-{Es}-{Fs}")    # net
        rv.cell(row=start, column=8, value=f'=IF({Cs}>0,{Gs}/{Cs},"")')     # margin
        for ci in (2, 3, 4, 5, 6, 7): money(rv.cell(row=start, column=ci))
        rv.cell(row=start, column=8).number_format = "0.0%"
        sell = m or 0; net = sell - padded - REFERRAL * sell - (fba or 0); marg = net / sell if sell else 0
        hue = "FF047857" if marg >= 0.15 else ("FFB45309" if marg >= 0.08 else "FFB91C1C")
        rv.cell(row=start, column=2).font = Font(size=11, bold=True, color="FF0F172A")
        for ci in (3, 4, 5): rv.cell(row=start, column=ci).font = Font(size=10, color=SLATE)
        rv.cell(row=start, column=7).font = Font(size=11, bold=True, color=hue)
        rv.cell(row=start, column=8).font = Font(size=11, bold=True, color=hue)
    for ci in range(2, 9): rv.cell(row=start, column=ci).alignment = CENTER
    for ci in range(1, 9):          # re-apply band + separators across the merged block
        for rw in range(start, end + 1):
            cell = rv.cell(row=rw, column=ci)
            cell.border = Border(top=GROUPL if rw == start else None, bottom=GRIDL if rw == end else None, right=(VDIV if ci == 8 else None))
            if band: cell.fill = band

# ═══ 2. Catalog ════════════════════════════════════════════════════
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
    base = costs.get(p["external_ref"])
    vals = [p["line"].title(), p.get("group_name") or "—", p["name"], p.get("model") or "—", specs,
            round(base * COST_BUFFER, 2) if base is not None else None, ncomp if ncomp else None, None]
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

for ws, land in [(rv, True), (cat, True)]:
    ws.page_setup.orientation = "landscape" if land else "portrait"
    ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_margins.left = ws.page_margins.right = 0.3; ws.page_margins.top = ws.page_margins.bottom = 0.4

out = os.path.expanduser(f"~/Desktop/Portal-Backup-{datetime.date.today().isoformat()}.xlsx")
wb.save(out)
print("saved:", out)
print(f"products {len(prods)} | competitors {len(comps)} across {len(cby)} products")
