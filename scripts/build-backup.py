import json, urllib.request, datetime
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

env={}
for line in open(".env.local"):
    if "=" in line and not line.strip().startswith("#"):
        k,v=line.split("=",1); env[k.strip()]=v.strip().strip('"').strip("'")
URL=env["NEXT_PUBLIC_SUPABASE_URL"]; KEY=env["SUPABASE_SERVICE_ROLE_KEY"]
def get(path):
    r=urllib.request.Request(URL+path,headers={"apikey":KEY,"Authorization":f"Bearer {KEY}"})
    return json.loads(urllib.request.urlopen(r,timeout=90).read())

SITE="https://the-portal-sourcing.netlify.app"
prods=get("/rest/v1/products?select=id,external_ref,line,group_name,subsection,name,model,specs,our_cost,our_cost_source,photo_state&order=line,name")
comps=get("/rest/v1/competitors?status=eq.approved&select=product_id,title,brand,asin,retail_url,price,price_avg90,price_min90,price_max90,bsr,bsr_best,est_monthly_sales,review_count,reviews_added_90d,fba_pick_pack_fee,buy_box_is_fba,listed_since")
pipe={r["product_id"]:r["status"] for r in get("/rest/v1/pipeline_status?select=product_id,status")}
cby={}
for c in comps: cby.setdefault(c["product_id"],[]).append(c)

# ── palette
INK="FF1F2937"; SLATE="FF334155"; BAND="FFF1F5F9"; ACCENT="FF4F46E5"; LINK="FF2563EB"
MUT="FF64748B"; GOOD="FF047857"; LINEHUE={"foodservice":"FF0E7490","appliance":"FF7C3AED","beauty":"FFBE185D"}
thin=Side(style="thin",color="FFE2E8F0")
def money(c): c.number_format='"$"#,##0.00'
def num(c): c.number_format='#,##0'
H_FILL=PatternFill("solid",fgColor=INK); H_FONT=Font(bold=True,color="FFFFFFFF",size=11)
def hdr(ws,row,cols,widths):
    for i,(t,w) in enumerate(zip(cols,widths),1):
        cc=ws.cell(row=row,column=i,value=t); cc.fill=H_FILL; cc.font=H_FONT
        cc.alignment=Alignment(vertical="center",horizontal="left",wrap_text=True)
        ws.column_dimensions[get_column_letter(i)].width=w
    ws.row_dimensions[row].height=26

wb=Workbook()

# ══ Sheet 1: Overview ══════════════════════════════════════════════
ov=wb.active; ov.title="Overview"; ov.sheet_view.showGridLines=False
ov.column_dimensions["A"].width=2; ov.column_dimensions["B"].width=26; ov.column_dimensions["C"].width=66
ov["B2"]="THE PORTAL"; ov["B2"].font=Font(bold=True,size=22,color=INK)
ov["B3"]=f"Product & Competitor Backup  ·  generated {datetime.date.today().isoformat()}"; ov["B3"].font=Font(size=11,color=MUT)
r=5
def line_ov(label,val,bold=False,hue=None):
    global r
    a=ov.cell(row=r,column=2,value=label); a.font=Font(bold=True,color=SLATE,size=11)
    b=ov.cell(row=r,column=3,value=val); b.font=Font(bold=bold,color=hue or "FF0F172A",size=11); b.alignment=Alignment(wrap_text=True,vertical="top")
    r+=1
fs=[p for p in prods if p["line"]=="foodservice"]; ap=[p for p in prods if p["line"]=="appliance"]; be=[p for p in prods if p["line"]=="beauty"]
line_ov("What this is","An offline snapshot of everything in the Portal — every product and every verified Amazon competitor with its Keepa data. Use it as a backup for reviewing and pricing if the live site is unavailable.")
r+=1
line_ov("Live site",SITE,hue=LINK)
line_ov("Products total",str(len(prods)),bold=True)
line_ov("   · Foodservice",f"{len(fs)}  (Amazon-ready line — has costs + competitor data)",hue=LINEHUE['foodservice'])
line_ov("   · Appliances",f"{len(ap)}  (factory-negotiation line — no cost yet; partner sets target sell)",hue=LINEHUE['appliance'])
line_ov("   · Beauty",f"{len(be)}",hue=LINEHUE['beauty'])
line_ov("Verified competitors",f"{len(comps)}  across {len(cby)} products (all with clickable Amazon links)",bold=True)
r+=1
line_ov("The two tabs","")
line_ov("   Products","Every product: line, category, specs, our cost, competitor count, and a link back to its live page.")
line_ov("   Competitors & Keepa","Every competitor listing — click the name to open it on Amazon — with current price, 90-day average, sales rank, monthly sales, reviews, and the real FBA fee.")
r+=1
line_ov("Keepa metrics, explained","")
for t,d in [("BSR / Best BSR","Amazon Best Seller Rank now vs. its best-ever — lower = hotter."),
            ("Sold / Month","Keepa's estimated units sold in the past month."),
            ("+90d","New reviews added in the last 90 days — momentum."),
            ("FBA Fee","Amazon's real fulfillment fee for that listing (not an estimate)."),
            ("Fulfillment","Whether the listing's Buy Box ships FBA or FBM.")]:
    a=ov.cell(row=r,column=2,value="   "+t); a.font=Font(color=SLATE,size=10)
    b=ov.cell(row=r,column=3,value=d); b.font=Font(color=MUT,size=10); r+=1

# ══ Sheet 2: Products ══════════════════════════════════════════════
ps=wb.create_sheet("Products"); ps.sheet_view.showGridLines=False
cols=["Line","Category","Product","Model","Key Specs","Our Cost","Cost Basis","Competitors","Stage","Live Page"]
wds=[13,22,40,16,46,11,26,12,12,12]
hdr(ps,1,cols,wds); ps.freeze_panes="A2"
order={"foodservice":0,"appliance":1,"beauty":2}
prods_sorted=sorted(prods,key=lambda p:(order.get(p["line"],9),p.get("group_name") or "",p["name"]))
rr=2
for p in prods_sorted:
    specs="; ".join(f'{s["label"]}: {s["value"]}' for s in (p.get("specs") or [])[:5])
    ncomp=len(cby.get(p["id"],[]))
    slug=p["external_ref"].split(":")[1]
    vals=[p["line"].title(),p.get("group_name") or "—",p["name"],p.get("model") or "—",specs,
          float(p["our_cost"]) if p.get("our_cost") is not None else None,
          p.get("our_cost_source") or "—",ncomp if ncomp else None,(pipe.get(p["id"]) or "new").title(),None]
    for ci,v in enumerate(vals,1):
        c=ps.cell(row=rr,column=ci,value=v); c.alignment=Alignment(vertical="center",wrap_text=(ci in(3,5,7)))
        c.border=Border(bottom=thin)
        if rr%2==0: c.fill=PatternFill("solid",fgColor=BAND)
        c.font=Font(size=10,color="FF0F172A")
    ps.cell(row=rr,column=1).font=Font(size=10,bold=True,color=LINEHUE.get(p["line"],INK))
    money(ps.cell(row=rr,column=6))
    lp=ps.cell(row=rr,column=10,value="Open ↗"); lp.hyperlink=f"{SITE}/p/{slug}"; lp.font=Font(color=LINK,underline="single",size=10)
    ps.row_dimensions[rr].height=30; rr+=1
ps.auto_filter.ref=f"A1:{get_column_letter(len(cols))}{rr-1}"

# ══ Sheet 3: Competitors & Keepa ═══════════════════════════════════
cs=wb.create_sheet("Competitors & Keepa"); cs.sheet_view.showGridLines=False
cols=["Our Product","Competitor Listing (click to open)","Brand","Price","90-Day Avg","90-Day Low–High","BSR","Best BSR","Sold/Mo","Reviews","+90d","FBA Fee","Fulfillment","First Listed"]
wds=[34,52,16,10,11,17,10,10,10,10,8,10,12,12]
hdr(cs,1,cols,wds); cs.freeze_panes="C2"
pname={p["id"]:p["name"] for p in prods}
# group competitors by product, product order = foodservice first
pidorder=[p["id"] for p in prods_sorted if cby.get(p["id"])]
rr=2; band_toggle=0
for pid in pidorder:
    band_toggle^=1
    grp=sorted(cby[pid],key=lambda c:-(c.get("est_monthly_sales") or 0))
    for gi,c in enumerate(grp):
        rng=""
        if c.get("price_min90") is not None and c.get("price_max90") is not None:
            rng=f'${float(c["price_min90"]):.2f}–${float(c["price_max90"]):.2f}'
        vals=[pname[pid] if gi==0 else "",c["title"],c.get("brand") or "—",
              float(c["price"]) if c.get("price") is not None else None,
              float(c["price_avg90"]) if c.get("price_avg90") is not None else None,
              rng or "—",
              c.get("bsr"),c.get("bsr_best"),c.get("est_monthly_sales"),c.get("review_count"),
              c.get("reviews_added_90d"),
              float(c["fba_pick_pack_fee"]) if c.get("fba_pick_pack_fee") is not None else None,
              ("FBA" if c.get("buy_box_is_fba") else ("FBM" if c.get("buy_box_is_fba") is not None else "—")),
              (c.get("listed_since") or "")[:7] or "—"]
        for ci,v in enumerate(vals,1):
            cc=cs.cell(row=rr,column=ci,value=v); cc.border=Border(bottom=thin)
            cc.alignment=Alignment(vertical="center",wrap_text=(ci in(1,2)))
            cc.font=Font(size=10,color="FF0F172A")
            if band_toggle: cc.fill=PatternFill("solid",fgColor=BAND)
        cs.cell(row=rr,column=1).font=Font(size=10,bold=True,color=INK)
        link=cs.cell(row=rr,column=2); 
        if c.get("retail_url"): link.hyperlink=c["retail_url"]; link.font=Font(color=LINK,underline="single",size=10)
        for ci in (4,5,12): money(cs.cell(row=rr,column=ci))
        for ci in (7,8,9,10,11): num(cs.cell(row=rr,column=ci))
        cs.cell(row=rr,column=13).alignment=Alignment(horizontal="center",vertical="center")
        cs.row_dimensions[rr].height=30; rr+=1
cs.auto_filter.ref=f"A1:{get_column_letter(len(cols))}{rr-1}"


from openpyxl.worksheet.properties import PageSetupProperties
for _ws,_land in [(ov,False),(ps,True),(cs,True)]:
    _ws.page_setup.orientation="landscape" if _land else "portrait"
    _ws.page_setup.fitToWidth=1; _ws.page_setup.fitToHeight=0
    _ws.sheet_properties.pageSetUpPr=PageSetupProperties(fitToPage=True)
    _ws.page_margins.left=_ws.page_margins.right=0.3
    _ws.page_margins.top=_ws.page_margins.bottom=0.4
ps.print_title_rows="1:1"; cs.print_title_rows="1:1"

out=f"/Users/zach/Desktop/Portal-Backup-{datetime.date.today().isoformat()}.xlsx"
wb.save(out)
print("saved:",out)
print(f"products {len(prods)} | competitors {len(comps)} across {len(cby)} products")
