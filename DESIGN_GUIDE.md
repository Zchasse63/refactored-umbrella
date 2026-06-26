# The Portal — Design Guide

> Single source of truth for the UI build. The Portal is a private, invite-only, two-sided sourcing-collaboration app for two equal partners, built to public-marketplace polish. Direction: **"Storefront with a broker-grade Deal Panel"** — a light storefront (catalog + a rich product page for every item) for browsing, and a dense cockpit (editable list, comparison board, dashboard, pipeline) for operating the negotiation. Full data transparency: both partners see everything; roles gate only *who edits*. Neutral / unbranded. Companion to `BUILD_PLAN.md`, `KEEPA_INTEGRATION.md`, and `AI_LAYER.md`.

## Canonical conventions (read first — these govern every section)

- **Author captions are runtime-injected:** `set by {memberName} · {relativeTime}` — never a literal partner name anywhere.
- **Color is reserved, one meaning each:** indigo = **Target** (+ focus ring); violet (hollow ring) = **Partner / market side / per-product override / terminology**; amber = **Quoted** (owner-edit, needs-photo, and owner-role-dot are disambiguated from Quoted by a mandatory glyph — pencil / camera / filled-dot vs. file-text); slate = **Actual**; emerald = **PASS/Go**; rose = **FAIL**. Every color state also carries a glyph + label (colorblind-safe).
- **Photo-state enum (one canonical set):** `good | clean-photo-needed | reshoot | missing`; driven by the vision-QA verdict.
- **Catalog reality (never round to "127"):** ~152 products = 70 appliances + 57 beauty + 25 Greenway; 45/57 beauty images contain Chinese text (24 flagged needs-clean-photo); 46/70 appliances list 220 V; 1 wrong-product image is quarantined from exports.
- **Numbers always** render in mono + tabular-nums; a missing value renders `—`, never `$0` or `NaN`.
- **Two registers:** Storefront (light, roomy) for /login, /catalog, /p/[slug]; Cockpit (dense, hairline, dark-capable later) for /products, /board, /pipeline, /dashboard, settings, import, exports.

## Contents

1. Page & route inventory
2. User flows & journeys
3. Component inventory (with states)
4. States, empty / error & edge cases (canonical state matrix)
5. Design system & tokens

---

## 1. Page & route inventory

This is the single authoritative map of every addressable surface in the Portal: real App Router routes, the persistent shell, page-like overlays (Sheets / Drawers / Dialogs that are full work surfaces but not routes), and the system/status pages. It is the source of truth for what exists; the visual *register* each surface uses, its component anatomy, and its data/security rules are specified in later sections and cross-referenced here.

**Coverage:** 53 distinct surfaces — 7 auth (A1–A7), 7 shell (B1–B7), 4 catalog (C1–C4), 2 PDP (D1–D2), 6 cockpit (E1–E6), 6 settings/import/export (F1–F6), 12 page-like overlays (G1–G12), 9 system/status (H1–H9). The `api/*` route handlers are server endpoints, not pages — every one of them maps to a user-facing UI state, captured in §1.9 below.

### 1.1 Reading the inventory — legend & global rules

**Register** (full spec in the two-register design-system section):
- **ST** = Storefront — light, roomy, imagery-forward. Used for `/login`, `/catalog`, `/p/[slug]`, and the catalog peek Sheet.
- **CK** = Cockpit — dense, hairline dividers, virtualized tables, dark-capable (Phase 3). Used for `/products`, `/board`, `/pipeline`, `/dashboard`, `/shortlist`, settings, import, exports.
- **SYS** = chromeless system/utility (redirects, callbacks, error/status pages) — no shell.
- **N/A** = pre-auth or page-like overlay that inherits the register of its host.

**Roles** (transparency rule — visibility is **never** gated, only *who edits*):
- **O** = Owner · **P** = Partner · **Both** = both roles see it. Owner edits products/specs/images/competitors/factory_quotes/global-assumptions and advances Costing→Quoted. Partner edits own selections (tier / target sell / target landed / per-product overrides / notes) and moves New↔Shortlisted; either role can move →Decision. Owner has a client-only **Preview as Partner** (B4).

**Global authorship & neutrality rule (applies to every editable field on every surface).** The app is NEUTRAL / unbranded — no literal partner names are ever hardcoded in UI copy or this guide. Every editable field carries an authorship caption rendered at runtime as **`set by {memberName} · {relativeTime}`** (e.g. "set by {memberName} · 2d ago"), where `{memberName}` comes from the `memberships` row and `{relativeTime}` is computed client-side. When you are viewing a field owned by the *other* role, the field shows a **lock glyph** and is read-only. Never write a literal name into a label, placeholder, or example.

**"E/L/Err"** = the empty / loading / error one-liner for that surface.

**Photo-state canonical enum (used by every image surface — D1, D2, C2 cards, G6, G8, exports).** Exactly four states, mapped from the vision-QA verdict; do not invent variants:

| State | Meaning | Gallery treatment | `export_ok` |
|---|---|---|---|
| `good` | usable US-market image | image shown | true |
| `clean-photo-needed` | has Chinese text / text-overlay / lifestyle clutter | image shown **under** amber camera-glyph "needs photo" chip | false (excluded from RFQ) |
| `reshoot` | wrong angle / unusable but product correct | branded **"Studio photo pending"** placeholder | false |
| `missing` | no image on file | branded **"Studio photo pending"** placeholder (never a broken-image icon) | false |

Vision-QA verdict → state mapping: `pass → good`; `foreign-text | text-overlay | lifestyle → clean-photo-needed`; `wrong-product → reshoot` **and** quarantined from exports; `no-image → missing`. The same enum drives `PhotoStateBadge`, `StudioPhotoPending`, `ImageGallery`, and `VisionQaBadge`.

**Catalog reality this inventory is designed around (never round to "127").** ~152 products = **70 RoyalStar appliances + 57 beauty/personal-care + 25 Greenway foodservice**. Of the 57 beauty images, **45 contain Chinese text** (**24** flagged `needs_clean_photo` → `clean-photo-needed`). **46 of 70 appliances** list **220 V** (US-sourcing landmine, surfaced as a voltage chip). **Exactly 1 appliance** has a wrong-product image → `reshoot` + export-quarantined. Greenway is the **only** line with a real *Actual* cost; appliances and beauty start with **no cost and no competitors** — first-load states must show Target-only with em-dashes (never `$0`/NaN).

**Color pins referenced throughout (full matrix in the design-system section — pinned here so the inventory is unambiguous):**

| Token | Reserved meaning | Mandatory glyph (amber disambiguation) |
|---|---|---|
| **Indigo** | **Target** column + **focus-ring** only | — |
| **Violet** (hollow ring) | **Partner / market side / per-product override / terminology** | hollow ring |
| **Amber** | **Quoted** column | `file-text` |
| Amber | owner-edit affordance | `pencil` (on neutral fill — keep amber *fills* meaning Quoted) |
| Amber | needs-photo flag | `camera` (slash) |
| Amber | Owner role-dot | filled dot |
| **Emerald** | PASS / Go | check |
| **Slate** | Actual | — |
| **Rose** | FAIL / Hold-Pass-danger / save-error | x / alert |

Partner is **violet only** — never "indigo/violet". Indigo is reserved for Target and the focus ring. No two amber meanings ever sit adjacent without their distinct glyph **and** a text label (colorblind-safe redundancy is mandatory everywhere).

---

### 1.2 A — Authentication & Access (pre-shell, neutral, unbranded)

| # | Route | Purpose | Roles | Reg | Primary layout regions | Key components | Empty / Loading / Error |
|---|---|---|---|---|---|---|---|
| A1 | `(auth)/login` | Magic-link request; invite-only, no public signup; neutral wordmark | Public (pre-auth) | ST | Centered card on roomy hero canvas; email field + "Send magic link"; fine-print "invite-only / contact owner" | Card, Input, Button, neutral logotype, Sonner | **E:** clean form default · **L:** button spinner "Sending…", field locked · **Err:** inline "Email not on the invite list / try again"; rate-limit notice |
| A2 | `(auth)/login?sent=1` — **magic-link-sent confirmation** | Post-submit "check your inbox" (same route, swapped view) | Public | ST | Centered confirmation card: mail glyph, masked email, "Resend" (cooldown), "Use a different email" | Card, countdown Button, Alert | **E:** n/a · **L:** resend cooldown timer · **Err:** "Couldn't resend — wait 60s" |
| A3 | `auth/callback` | Supabase PKCE code-exchange redirect handler; sets session → `/` | Public→auth | SYS | Full-bleed minimal spinner panel ("Signing you in…") | Spinner only; server redirect | **E:** n/a · **L:** the whole page *is* the loading state · **Err:** → A6 expired/invalid link |
| A4 | `(auth)/invite/accept` (or `auth/callback?type=invite`) | First-time invitee accepts invite, confirms `display_name`, lands membership row | Invitee | ST | Centered card: greeting, display-name field, role chip (read-only), "Enter the Portal" | Card, Input, role Badge, Button | **E:** n/a · **L:** "Setting up your access…" · **Err:** "Invite already used / revoked / wrong account" |
| A5 | `(auth)/no-access` — **awaiting-access** | Authenticated user with **no membership row** (signed in but not provisioned) | Any signed-in non-member | ST | Centered card: "Your account isn't linked to this workspace yet", owner-contact line, "Sign out" | Card, Alert, Button | **E:** the page *is* the blocked state · **L:** membership-check spinner · **Err:** generic fallback copy |
| A6 | `(auth)/login?error=expired` — **expired / invalid / used link** | Magic link expired, already consumed, or tampered | Public | ST | Centered card: rose alert, "This link expired", "Send a new link" → A1 | Alert, Button | **E:** n/a · **L:** re-request spinner · **Err:** *is* the state itself |
| A7 | `auth/sign-out` (action/route) | Clears session, redirects to `/login` | Both | SYS | No UI (transient) | server action | **L:** brief redirect flash |

---

### 1.3 B — The App Shell (persistent chrome around every `(app)` route)

| # | Surface | Purpose | Roles | Reg | Layout region | Key components | Empty / Loading / Error |
|---|---|---|---|---|---|---|---|
| B1 | **Top bar** | Persistent header: logo→`/`, primary nav, ⌘K trigger, role badge, presence avatars, account menu | Both | adapts | Fixed top strip across all `(app)` pages | Nav links, Avatar/presence stack, Button | **L:** skeleton nav + avatar shimmer · **Err:** nav still renders if data fails |
| B2 | **⌘K Command Palette** | Global navigate / jump-to-product / run actions (Build RFQ, Add competitor, Open calc) | Both | overlay | Centered Command dialog over dimmed app | `Command` (shadcn), grouped results, recents | **E:** "No matches" · **L:** "Searching…" inline · **Err:** "Search unavailable — use nav" |
| B3 | **Role badge** | Current role: **amber filled-dot = Owner** · **violet hollow-ring = Partner**; colorblind-safe text label always present | Both | top-bar chip | Badge with glyph + text, Tooltip | static; no error state |
| B4 | **"Preview as Partner" toggle** | Owner-only **client-only** mode: renders UI as Partner would see/edit (lock glyphs flip); no server effect | O only | top-bar / account menu | Toggle + persistent "Previewing as Partner — exit" banner | Switch, sticky Banner, Button | **E:** n/a · **L:** instant client toggle · **Err:** auto-revert on nav if state lost |
| B5 | **Account / user menu** | Dropdown: name, role, → `/settings/profile`, theme (Phase 3 dark cockpit), Sign out | Both | top-bar dropdown | DropdownMenu, Avatar | static |
| B6 | **Global toast region** | App-wide success / error / optimistic feedback (autosave, quote saved, RFQ built, realtime conflict) | Both | bottom-corner stack | Sonner | shows error toasts |
| B7 | **Realtime / connectivity banner** | Slim inline banner when a Realtime subscription drops | Both | sticky sub-bar under top bar | Banner, retry affordance | **E:** hidden when healthy · **L:** "Live updates paused — reconnecting…" · **Err:** "Offline — changes will sync when reconnected" |

---

### 1.4 C — Catalog / Storefront

| # | Route | Purpose | Roles | Reg | Primary layout regions | Key components | Empty / Loading / Error |
|---|---|---|---|---|---|---|---|
| C1 | `(app)/` → redirect | Index redirects to `/catalog` | Both | SYS | — | server redirect | n/a |
| C2 | `/catalog` (**grid**) | Faceted storefront browse; **all** filter state in URL (shareable saved view) | Both | ST | Left facet rail (Line→Group/Section→Subsection, Brand, Tier, Pipeline status, Has-quote, Photo state, Price band — live counts) · top toolbar (search, grid/table toggle, sort, active-filter chips) · responsive card grid | Accordion facets, storefront Card (economics ribbon + 3-dot Target/Quoted/Actual completeness + camera-slash photo badge), Tabs, fuzzy search Input | **E:** "No products match these filters — Clear" · **first-run empty:** → F6 · **L:** card skeletons + facet shimmer · **Err:** "Couldn't load catalog — retry" |
| C3 | `/catalog?view=table` (**table toggle**) | Same data as a dense storefront table (denser than grid, lighter than cockpit) | Both | ST | Same rail; virtualized table; sortable mono columns (target / quoted / net% / status) | Table (virtualized), column sort, row→peek | **E:** "No rows match" · **L:** row skeletons · **Err:** retry banner |
| C4 | `(.)p/[slug]` — **intercepting peek Sheet** | PDP as a right-side slide-over from any catalog/list row; ↑/↓ walk prev/next, Esc dismiss; deep-linkable | Both | ST overlay | Right Sheet mirroring PDP (gallery + condensed Deal Panel) | Sheet, `<EconomicsWaterfall>`, keyboard nav | **E:** n/a · **L:** panel skeleton while economics island hydrates · **Err:** "Couldn't open — open full page" → D1 |

---

### 1.5 D — Product Detail (the centerpiece — every one of ~152 products has one)

| # | Route | Purpose | Roles | Reg | Primary layout regions | Key components | Empty / Loading / Error |
|---|---|---|---|---|---|---|---|
| D1 | `/p/[slug]` — **full PDP** | Server shell + single client "economics island" Deal Panel; slug resolves across lines via `products.external_ref` | Both | ST | **Left:** image gallery (object-contain neutral tile, lightbox, photo-state chip, "Studio photo pending" placeholder), at-a-glance spec chips, features / selling-points, specs table (mono; "— needed for tier fee" stubs), competitor mini-pages, activity & comments. **Right (Deal Panel):** 3-number header (**Target\|Quoted\|Actual** + PASS/FAIL pill), live P&L waterfall, PASS/headroom lamp, **"Targets"** block (violet, market side), **"Factory quote"** block (amber/Quoted, cost side), pipeline selector, "Open calculator" + "Add to RFQ" | `<EconomicsWaterfall>`, gallery/lightbox Dialog, specs Table, competitor Cards, comments thread, authorship captions (`set by {memberName} · {relativeTime}`) + lock glyphs, 220 V voltage flag chip | **E:** no-cost state shows **Target only** with em-dashes for Quoted/Actual (never `$0`); no competitors → "No competitors yet — add / discover"; no specs → "Specs not provided" · **L:** server shell instant, island skeleton · **Err:** island error boundary "Economics unavailable — reload"; **quarantine:** wrong-product-image SKU shows blocked-image notice |
| D2 | `/p/[slug]` — **photo-state variants** (inline, not separate routes) | The four canonical photo states surfaced on the gallery | Both | ST | Gallery zone | `PhotoStateBadge`, `StudioPhotoPending` | **good:** image shown · **clean-photo-needed:** amber camera-glyph "needs photo" chip over image · **reshoot / missing:** branded "Studio photo pending" placeholder (never a broken-image icon) |

---

### 1.6 E — Operator Cockpit (dense work surfaces)

| # | Route | Purpose | Roles | Reg | Primary layout regions | Key components | Empty / Loading / Error |
|---|---|---|---|---|---|---|---|
| E1 | `/products` — **editable list** | "Don't make me open every page" — inline-edit tier / target sell / factory quote per row; derived landed, net%, PASS/FAIL, stage update in place | Both (P edits targets · O edits quote) | CK | Virtualized table; sticky header w/ filters & search; footer rollups (# Pursue, # quoted, # PASS/FAIL) + "Build RFQ from Pursue" | Virtualized Table, inline Input/Select cells, PASS/FAIL pill, lock glyph on cells you can't edit, authorship-caption tooltip | **E:** "No products — import to begin" → /import · **L:** row skeletons, optimistic cell save · **Err:** per-cell rose ring + "Couldn't save — retry"; conflict toast on realtime collision |
| E2 | `/board` — **comparison cockpit** | Dense virtualized comparison; rank/sort by headroom or net% to triage every SKU by the number | Both | CK | Full-width virtualized comparison table; sort/group controls; `?mode=` toggle to Kanban | Virtualized Table, sort header, headroom/net% bars, `<EconomicsWaterfall>` mini, Tabs/toggle | **E:** "Nothing to compare yet" · **L:** skeleton grid · **Err:** retry banner |
| E3 | `/board?mode=kanban` — **Kanban toggle** | Same board data as Kanban columns (toggle, not a separate route) | Both | CK | Column lanes; draggable cards | Kanban columns, draggable Card | **E:** empty lanes w/ ghost hint · **L:** column skeletons · **Err:** drag-fail revert toast |
| E4 | `/pipeline` — **shared pipeline** | Linear-style shared Kanban: New → Shortlisted → Costing → Quoted → Decision (Go/Hold/Pass); Realtime moves; transitions gated by role | Both (P: New↔Shortlisted · O: Costing→Quoted · either→Decision) | CK | 5+ columns w/ counts; draggable cards; presence cursors; decision sub-states | Kanban, drag-drop, presence avatars, `can_transition` guard, Decision Badge | **E:** all in "New" first-run · **L:** column skeletons · **Err:** "Move not allowed for your role" + drag revert; realtime-degraded → B7 |
| E5 | `/dashboard` — **owner cockpit** (visible to both) | KPI cards + selections table; multi-select → **Build Factory RFQ**; inline "Enter quote" | Both (O acts) | CK | KPI card row (# Pursue, # quoted, avg headroom, PASS rate) · selections table w/ multi-select · action bar (Build RFQ) · inline quote-entry | KPI Cards, selectable Table, multi-select toolbar, inline quote popover, `<EconomicsWaterfall>` summary | **E:** "No selections yet — partner hasn't picked" / zeroed KPI cards · **L:** card + table skeletons · **Err:** KPI fallback "—", table retry |
| E6 | `/shortlist` — **partner working set** | Partner's saved "Pursue" view — curated working subset | Both (P-owned) | CK | Filtered list/grid (tier=pursue), quick-edit targets, "promote to RFQ" | reuses /products table filtered, Badge | **E:** "Your shortlist is empty — mark products Pursue" · **L:** skeletons · **Err:** retry |

---

### 1.7 F — Settings, Import, Exports

| # | Route | Purpose | Roles | Reg | Primary layout regions | Key components | Empty / Loading / Error |
|---|---|---|---|---|---|---|---|
| F1 | `/exports` | RFQ-builder entry, filtered CSV/Excel exporter, quote-import dropzone, bulk-import entry | Both | CK | Tabs/sections: RFQ-builder launch, general export (column picker + filters), quote-import dropzone, import-report area | `RfqBuilderDrawer` launcher, column-picker, Dropzone, import-report Table | **E:** "Nothing selected to export" · **L:** "Building file…" progress · **Err:** "Export failed — retry"; CSV parse errors listed (→ §1.9) |
| F2 | `/settings/assumptions` | Global cost-stack + target-margin editor; save ripples to every non-overridden product | Both (O edits, P reads) | CK | `<CostStackEditor>`: addable/removable %-line sliders, live "= 49% opex" total, "landed ≤ 35%" helper, gross-margin control with explicit "(COGS vs price)" label; per-line profiles (foodservice FBA N/A) | `<CostStackEditor>`, Slider+Input, live total, terminology-safe labels, save-with-ripple confirm | **E:** seeded defaults always present · **L:** "Recomputing all products…" ripple progress · **Err:** "Save failed — values rolled back"; guard sell=0 → "—" |
| F3 | `/settings/members` | Owner-only invite & role management (invite by email, set role, revoke / resend) | O only | CK | Members table (name, email, role, status) + "Invite" action | Table, invite Dialog, role Select, status Badge | **E:** seed 2 members (owner + partner) · **L:** skeletons · **Err:** "Invite failed / email exists"; **403** (H2) for partner who deep-links here |
| F4 | `/settings/profile` (alias `/account`) | Per-user: display name, email (read-only), theme pref, notification pref, sign out | Both | CK | Form card: display-name, email, theme, notifications | Form, Input, Switch, Button | **E:** n/a · **L:** save spinner · **Err:** "Couldn't save profile" |
| F5 | `/import` | Owner-only **idempotent** importer with **dry-run diff**; appliances/beauty JSON + Greenway one-way | O only | CK | Source picker (appliances / beauty / Greenway / CSV-JSON) · "Dry run" · **diff screen** (adds / updates / unchanged / conflicts) · "Commit import" | source Tabs, Dropzone, **dry-run diff Table** (color-coded add/update/skip), data-cleaning flags (220 V, image `export_ok`), Commit Button | **E:** "Choose a source to begin" · **L:** "Analyzing source… / Uploading images…" progress · **Err:** "Import failed — nothing committed"; per-row mapping errors (→ §1.9); **403** (H2) for partner |
| F6 | `/catalog` — **first-run / empty-catalog** state | Pre-import zero state (no products yet) | Both | ST | Centered empty-catalog panel: Owner sees "Import catalog" CTA → /import; Partner sees "Waiting for owner to import" | Empty state, CTA Button (O) / informational (P) | *is* the empty state; **L:** initial count-check skeleton |

---

### 1.8 G — Page-like Modals / Drawers / Sheets (full work surfaces, not routes)

| # | Surface | Purpose | Roles | Reg | Trigger / region | Key components | Empty / Loading / Error |
|---|---|---|---|---|---|---|---|
| G1 | **RFQ Builder drawer** `<RfqBuilderDrawer>` | Previewable factory RFQ: validate columns, edit MOQ-ask, exclude flagged images, snapshot `calc_inputs` → Excel + PDF via `/api/rfq` | Both (O-primary) | CK Drawer | From /exports, /dashboard, /products "Build RFQ" | Drawer, column toggles, editable MOQ cells, image-exclusion list, "Generate Excel/PDF" | **E:** "No Pursue items selected" · **L:** "Embedding images / building workbook…" · **Err:** "Generation failed" (→ §1.9); warns if **all** images excluded |
| G2 | **Calculator / per-product override Sheet** | "Open calculator" Deal-Panel surface: live recompute every keystroke/slider; per-product overrides with **violet hollow-ring "Overriding global" chip** + reset | Both (P edits) | Sheet | "Open calculator" on PDP / peek | Sheet, Slider+Input, `<EconomicsWaterfall>`, override chip + Reset, terminology-safe labels | **E:** inherits global defaults · **L:** instant client recompute · **Err:** guard sell>0 → "—" never NaN/`$0`; autosave-fail toast |
| G3 | **Quote-entry popover/dialog** | Owner enters factory quote (DDP, MOQ, lead time, supplier, `is_selected`) → live PASS/FAIL recompute app-wide | O only | Dialog/Popover | "Enter quote" on dashboard / list / PDP | Dialog, mono Inputs, `is_selected` toggle | **E:** blank quote form · **L:** "Saving quote…" optimistic · **Err:** rose "Save failed"; lock glyph for partner |
| G4 | **Add / edit competitor dialog** | Owner manually adds/edits a competitor mini-page (title, ASIN, price, rating, BSR, image, URL) | O only | Dialog | Competitor section "Add" | Dialog, mono Inputs, marketplace Badge select | **E:** blank form · **L:** "Saving…" · **Err:** validation (ASIN format), save fail |
| G5 | **AI competitor candidate review** | Confirm/reject AI-discovered candidate ASINs (`status` candidate→approved/rejected); reject-with-reason feeds `search_profiles` | Both (O-primary) | Drawer/Dialog | Competitor section "Discover" / candidates badge | candidate cards w/ `match_confidence` + `match_reason`, approve/reject, `reason_code` picker; **cross-links to G12 Search-profile editor** | **E:** "No candidates — run discovery" · **L:** "Claude is searching… / verifying…" · **Err:** discovery / `web_search` tool-error / quota (→ §1.9); null-field "—" |
| G6 | **Image upload + vision-QA dialog** | Owner uploads product image; Claude vision auto-assigns the photo-state enum (good / clean-photo-needed / reshoot / missing) and sets `export_ok` | O only | Dialog | Gallery "Upload" / manage photos | Dropzone, preview, `VisionQaBadge`, `export_ok` toggle | **E:** drop prompt · **L:** "Uploading… / Running image QA…" · **Err:** "Upload failed / unsupported format" (→ §1.9); QA-flagged warning |
| G7 | **Quote-import report** (pre-commit) | After CSV dropzone: matched / unmatched by `external_ref` before committing `factory_quotes` | Both (O acts) | Drawer/section | /exports quote-import | report Table (matched / unmatched), Commit Button | **E:** "No rows parsed" · **L:** "Matching…" · **Err:** "Unmatched refs — fix or skip" list; malformed-CSV (→ §1.9) |
| G8 | **Image lightbox** | Full-size product image viewer | Both | Dialog | Gallery click | Dialog, zoomable image, prev/next | **E:** n/a · **L:** image spinner · **Err:** "Image unavailable" (never broken icon → falls back to `StudioPhotoPending`) |
| G9 | **Spec / copy cleanup review** | Review Claude-rewritten US-English copy / normalized specs / 220 V flag before accepting (45/57 beauty images carry Chinese text the copy mirrors) | O only | Drawer/Dialog | PDP / import "Clean copy" | before/after diff, accept/reject, voltage flag | **E:** "Nothing to clean" · **L:** "Rewriting copy…" · **Err:** "Cleanup failed — keep original" (→ §1.9) |
| G10 | **Taxonomy normalization review** | Confirm AI-normalized categories / Amazon browse-node mapping | O only | Drawer/Dialog | import / settings | mapping table, accept/override | **E:** "Already normalized" · **L:** "Normalizing…" · **Err:** mapping-fail fallback (→ §1.9) |
| G11 | **Saved-view / share-link affordance** | Copy current URL filter-state as a shareable saved view | Both | inline/popover | catalog toolbar | copy-link Button, toast | **E:** n/a · **Err:** clipboard-fail fallback |
| G12 | **Search-profile editor** (`search_profiles`) | PDP advanced drawer: view/edit the **versioned per-product Keepa Finder recipe** (chosen browse-node, query terms, `exclude_terms`, spec filters) that drives AI discovery; shows version history and what human rejections (G5) have taught it | O only | Drawer | PDP "Advanced / search recipe"; cross-linked from G5 | Drawer, term chips, exclude-term editor, node picker, version timeline, "Re-run discovery" | **E:** "No saved recipe — generate from specs" · **L:** "Building Finder query… / saving version…" · **Err:** "Couldn't save recipe" / Keepa node-lookup fail (→ §1.9) |

---

### 1.9 H — Global System / Status pages, and the API → UI-state map

Every system page is **SYS** register (chromeless, neutral). Listed first, then the mandatory mapping of each `api/*` failure to a user-facing state.

| # | Route / Surface | Purpose | Roles | Layout | Key components | Notes |
|---|---|---|---|---|---|---|
| H1 | `not-found.tsx` — **404** | Unknown route / dead product slug | Both | Centered: "Not found", → /catalog | Illustration, Button | also fires when an `external_ref` slug doesn't resolve |
| H2 | `forbidden.tsx` — **403** | Authenticated but lacks capability (partner hitting /import, /settings/members) | Both | Centered: "You don't have access to this", role chip, → back | Alert, role Badge, Button | UI normally hides the links; deep-link guard renders this |
| H3 | `error.tsx` — **500 / error boundary** | Unhandled server/client exception (route-level + nested island boundaries) | Both | Centered: "Something broke", "Try again" (reset), support note | error boundary, reset Button | nested boundary wraps the Deal-Panel economics island |
| H4 | `global-error.tsx` — **root error** | Top-level boundary if the shell itself crashes | Both | Bare, no shell: "The app hit a problem — reload" | minimal | replaces the entire shell |
| H5 | **Offline / realtime-degraded banner** | Connectivity loss / Realtime drop (same surface as B7) | Both | sticky sub-bar | Banner | "Live updates paused" / "Offline — will sync" |
| H6 | `/maintenance` (or 503) | Planned downtime / deploy window | Both | Centered: neutral "Back shortly" | static | feature-flag / Netlify-redirect driven |
| H7 | `loading.tsx` — **root loading** | App-shell + route-suspense fallback | Both | Skeleton shell (top bar + content placeholders) | Skeleton | per-segment loading files for catalog / board / dashboard |
| H8 | **Session-expired interstitial** | Session lapses mid-use → re-auth without losing context | Both | Modal over dimmed app: "Session expired — sign in to continue" | Dialog, → /login | preserves return URL |
| H9 | `robots` / no-index posture | Private app: block indexing of the neutral storefront | — | metadata / headers | — | not a visible page; included for completeness |

**API → UI-state map (every `api/*` handler routes its failure modes to a concrete surface — no silent failures).** The handlers are server endpoints (out of scope as *pages*) but each is owned by a UI surface above:

| API route | Owning surface | Success state | Timeout | 429 / quota | Tool / lib-specific error | Malformed / partial |
|---|---|---|---|---|---|---|
| `api/rfq` | G1 RFQ Builder | Excel + PDF download | "Taking longer than expected — retry" | "Generation queue busy — retry shortly" | exceljs/PDF failure → "Couldn't build the workbook" | warns if all images `export_ok=false` |
| `api/export` | F1 /exports | CSV/Excel download | retry banner | — | file-write fail → "Export failed — retry" | partial-column warning |
| `api/import/quotes` | G7 quote-import report | matched rows committed | "Match timed out — retry" | — | — | malformed CSV → per-row "Unmatched refs — fix or skip" |
| `api/import/products` | F5 /import | dry-run diff → commit | "Analysis timed out" | — | image-upload fail listed per row | per-row mapping errors; **nothing committed** on failure |
| `api/import/greenway` | F5 /import (Greenway tab) | one-way diff → commit | "Analysis timed out" | — | — | per-row mapping errors |
| `api/enrich/keepa` | D1 competitor section / G12 | mini-pages populated | "Keepa slow — retry" | "Keepa quota hit — try later" | node-lookup fail → "Couldn't reach Keepa" | partial enrich → null fields render "—" |
| `api/ai/discover` | G5 candidate review | candidate cards appear | "Discovery timed out" | "AI quota hit — retry later" | **`web_search` tool-error** → "Web search unavailable" | partial results shown with notice |
| `api/ai/verify` | G5 (gate before UI) | verified candidates surfaced | "Verification timed out" | quota notice | structured-judge parse fail → hold candidate, flag | partial → unverified stay hidden |
| `api/ai/cleanup` | G9 copy cleanup | before/after diff | "Rewrite timed out" | quota notice | parse fail → "Cleanup failed — keep original" | partial → original retained |
| `api/ai/vision-qa` | G6 vision-QA | photo-state enum + `export_ok` set | "Image QA timed out" | quota notice | vision fail → leave state `clean-photo-needed`, warn | partial batch → per-image status |
| `api/ai/taxonomy` | G10 taxonomy review | mapping table | "Normalization timed out" | quota notice | mapping fail → manual-override fallback | partial → unmapped flagged |

**Testing & QA surface (folded-in coverage gap).** Each route group above carries a corresponding test surface in the QA suite — not a user-facing page, but enumerated here so the inventory is complete and nothing ships untested:

- **E2E (Playwright):** auth happy-path (A1→A3→/catalog) and the three auth failure states (A5 no-membership, A6 expired link, H8 session-expired); catalog filter-state-in-URL round-trip (C2/C3/G11); PDP economics island incl. **no-cost em-dash** and **quarantined-image** cases (D1); inline-edit optimistic save + realtime-conflict (E1); pipeline role-gated transition rejection (E4); RFQ build → Excel/PDF (G1); quote-import round-trip (G7) and the **app-wide PASS/FAIL recompute** it triggers.
- **Role/capability tests:** partner deep-linking /import and /settings/members must hit **403 (H2)**; "Preview as Partner" (B4) must never write to the server.
- **Component/visual-regression:** `<EconomicsWaterfall>` (Target-only, Quoted-live, Actual-live, FAIL lamp), `<CostStackEditor>` 49%-total + gross-vs-net terminology guard, all four `PhotoStateBadge` states, and the amber-disambiguation glyph set (`file-text` / `pencil` / `camera` / filled-dot).
- **API-contract tests:** each `api/*` failure mode in the table above asserts its mapped UI state (timeout, 429/quota, `web_search` tool-error, exceljs/PDF failure, malformed CSV, partial enrich) so the "no silent failure" rule is enforced in CI.

---

## 2. User flows & journeys

> **Reading conventions for every flow.** **Actor** = Owner (amber **filled-dot** ●) / Partner (violet **hollow-ring** ◯) / System. **Register** = *Storefront* (light, roomy, imagery-forward) or *Cockpit* (dense, hairline dividers, virtualized). Each step is written **screen → component / action**. Decision points are marked ◆. Edge/failure branches live in their own sub-table. **"Live column"** = Quoted → else Actual → else Target. **PASS lamp** = emerald `+ ✓`; **FAIL** = rose `+ ✕`; **headroom-neutral** = slate `+ —` — a redundant glyph *always* accompanies color (colorblind-safe). Money / % / SKU / model / ASIN / `external_ref` always render **MONO + tabular-nums**; `sell ≤ 0` renders `—`, never `NaN`/`$0`.
>
> **Cross-cutting design-system rules that govern every flow below (pinned here so individual steps stay terse):**
> - **Neutral / unbranded.** No literal "Yuno"/"Viral" string appears anywhere — in UI chrome, email templates, or captions. **Authorship captions are runtime-injected: `set by {memberName} · {relativeTime}`** (e.g. "set by {memberName} · 2d ago"), resolved from `activity` + `memberships`. Never hard-code a partner's name.
> - **Color is meaning-only and pinned.** **Target = INDIGO. Quoted = AMBER. Actual = SLATE. PASS/Go = EMERALD. FAIL = ROSE. Partner / market-side / per-product override / terminology = VIOLET (hollow ring) only. Focus-ring = INDIGO.** Indigo is reserved for **Target + focus**; Partner is **never** "indigo/violet" — it is **violet only**.
> - **Amber-overload disambiguation (mandatory distinct glyph per meaning, never two amber meanings adjacent without glyph+label):** Quoted column = **file-text** glyph; owner-edit affordance = **pencil** glyph (rendered on **neutral**, not amber fill, so amber *fills* mean Quoted only); needs-photo flag = **camera** glyph; Owner role = **filled-dot** ●.
> - **Field-ownership lock.** Every editable field shows an authorship caption + a **lock glyph** when you are the *other* role. Partner owns `selections` (tier / target sell / target landed / per-product overrides / notes) and `New ↔ Shortlisted` pipeline moves. Owner owns `products`/specs/images/`competitors`/`factory_quotes`/global `assumptions` and `Costing → Quoted`. **Either** role may set the **Decision** sub-state.
> - **Gross ≠ net guard.** "65% gross" (COGS ≤ 35%) and "≈16% net" are never adjacent, never the same color, always suffixed with their qualifier.
> - **Photo-state canonical enum** (used identically by `PhotoStateBadge` / `StudioPhotoPending` / `ImageGallery` / `VisionQaBadge`): **`good | clean-photo-needed | reshoot | missing`**. Vision-QA verdict → state map: *clear US-English usable image* → `good`; *Chinese text / text-overlay detected, original salvageable* → `clean-photo-needed`; *wrong-product or unusable* → `reshoot`; *no image asset* → `missing`. `clean-photo-needed` and `reshoot` and `missing` all render the branded **"Studio photo pending"** placeholder (never a broken-image icon); `reshoot` + wrong-product images are **quarantined from RFQ exports**.
> - **Catalog scale (never "127"):** **~152 products = 70 RoyalStar appliances + 57 beauty/personal-care + 25 Greenway foodservice.** Data realities the flows must surface: **45/57** beauty images contain Chinese text (**24** flagged `needs_clean_photo`), **46/70** appliances list **220 V** (US-sourcing landmine), **1** appliance has a wrong-product image (quarantined). Greenway is the **only** line that imports a real **Actual** cost; appliances/beauty start with **no cost and no competitors**.

---

### 2.1 Flow taxonomy (index)

| Group | Flows | Primary register |
|---|---|---|
| **A. Onboarding & access** | A1 invite, A2 accept→first-login, A3 returning login, A4 expired-link recovery | Storefront |
| **B. Partner (market-side) core** | B1 browse→shortlist→tier→target sell→calc→notes, B2 manage shortlist, B3 partner pipeline move | Storefront / Cockpit-lean |
| **C. Owner (cost-side) core** | C1 Pursue→RFQ build→export, C2 quote import/inline→PASS-FAIL flip, C3 owner pipeline advance | Cockpit |
| **D. Calculator & assumptions** | D1 global ripple, D2 per-product override→reset | Cockpit / PDP |
| **E. Competitor discovery** | E1 discover→review→approve/reject→learn→re-run, E1-a Search-profile editor drawer | Storefront PDP |
| **F. Import / data-cleaning** | F1 appliances+beauty JSON, F2 Greenway/Servous Actuals, F3 quote round-trip / bulk entry | Cockpit |
| **G. Realtime / co-editing / system** | G1 concurrent PDP edit, G2 Preview-as-Partner, G3 ⌘K palette | App shell / PDP |
| **H. Cross-cutting supporting** | 16 enumerated supporting flows (faceting, peek-nav, audit, sign-out, route-guards, image lifecycle, …) | Both |

---

### A. Onboarding & access flows

#### A1 — Owner invites the Partner *(Cockpit)*

**Trigger:** Owner clicks "Invite member" on `/settings/members`. **Actors:** Owner (write); System (email); Supabase Auth.

| # | Screen → component / action |
|---|---|
| 1 | `/settings/members` → **"Invite member"** button (owner-only; route 403s for partner, nav item hidden) |
| 2 | Invite dialog → email field + role select (`owner | partner`), default = **partner** |
| 3 | Submit → System creates pending `memberships` row (`role`, `status=invited`) + generates magic-link invite token |
| 4 | System → Supabase Auth sends magic-link (invite-only template, **neutral/unbranded** — no marks) |
| 5 | Members table shows new row → **"Invited · pending"** pill + role accent (Owner ● amber / Partner ◯ violet) + **Resend** / **Revoke** |

◆ **Decision:** role `owner` vs `partner` → governs edit gates app-wide.

| Edge / failure | Branch / handling |
|---|---|
| Email already a member | Inline "Already a member"; no duplicate row |
| Partner reaches `/settings/members` | Route guard → 403 / redirect `/catalog`; nav item hidden |
| Invite bounces / not received | **Resend** regenerates token |
| Owner revokes pre-acceptance | Membership voided; token invalidated; link now errors |
| Malformed email | Field validation; submit disabled |
| Demote/remove **last owner** | Blocked — "Can't remove the last owner" |

#### A2 — Partner accepts invite → first login *(Storefront → app shell)*

**Trigger:** Partner clicks magic-link in invite email.

| # | Screen → component / action |
|---|---|
| 1 | Email → magic-link → `/auth/callback?code=…` |
| 2 | `auth/callback` → Supabase code exchange → session minted; membership `invited → active` |
| 3 | Redirect `/` → rewrites to `/catalog` (default landing) |
| 4 | App shell renders: top bar, ⌘K palette, **role badge = Partner (◯ violet)** |
| 5 | First-run: `/catalog` grid populated; partner's `selections` empty (no Pursue items yet) |

✅ **End-state:** Partner authenticated, `role=partner`, on `/catalog`, **full read access to everything**.

| Edge / failure | Branch |
|---|---|
| Link expired / already used | → `/login?error=expired`, prefilled email, re-send (A4) — idempotent |
| Code exchange fails (network) | Retry CTA on callback; no session created |
| Accepted on device B while invited on A | Session per device; both valid once active |
| Pre-acceptance direct URL | Unauthenticated → bounce `/login` |

#### A3 — Returning magic-link login (either role) *(Storefront)*

| # | Screen → component / action |
|---|---|
| 1 | `(auth)/login` → email input + **"Send magic link"** (neutral; **no public signup** link) |
| 2 | Submit → Supabase sends link → **"Check your email"** confirmation state |
| 3 | Click link → `auth/callback` exchange → session |
| 4 | Redirect `/catalog`; role badge reflects membership role |

| Edge / failure | Branch |
|---|---|
| Email not on an invite/membership | **Non-enumerating** message: "If you're a member, a link is on its way" (invite-only privacy) |
| Rate-limited resend | Cooldown timer on button |
| Wrong/old link | → A4 recovery |
| Already-authenticated hits `/login` | Redirect `/catalog` |

#### A4 — Expired / invalid magic-link recovery

| # | Screen → component / action |
|---|---|
| 1 | `auth/callback` detects expired/invalid/used code → redirect `/login?error=expired` |
| 2 | `/login` → inline banner "Your link expired or was already used" |
| 3 | Email prefilled (if recoverable) → **"Send a new link"** |
| 4 | New link issued → resume A2/A3 |

✅ **End-state:** new valid session. ◆ **Branch:** invite-token expiry vs session-link expiry both funnel here.

---

### B. Partner (market-side) core flows

#### B1 — Browse → shortlist → tier → target sell → calculator computes target landed → notes *(Storefront)*

**Trigger:** Partner browses `/catalog`. **Actors:** Partner (writes own `selections`); System (live calc).

| # | Screen → component / action |
|---|---|
| 1 | `/catalog` → faceted browse; **grid ↔ table** toggle; **all filter state in URL** (line, tier, has-quote, image-state, 220V, headroom, net%) |
| 2 | Click a card → intercepting **`(.)p/[slug]`** → **PDP peek Sheet** (right side); **↑/↓ = prev/next** in current filtered set, **Esc** = close to scroll position |
| 3 | Peek/PDP → **Deal Panel** (docked buy-box); blocks labeled **"Targets"** (market) and **"Factory quote"** (cost) — **never** "Partner sets"/"Owner enters" |
| 4 | Deal Panel → **tier control** → **Pursue** (`selections.tier=pursue`); caption "set by {memberName} · now" |
| 5 | "Targets" block → **target sell price** input (mono, tabular-nums; `sell ≤ 0` → `—`) |
| 6 | System → **live calculator** every keystroke: opex stack **49%** (referral 15 / ads 15 / FBA 15 / returns 4) + **0%** partner-split; **65% gross → target landed ≤ 35% of sell (DDP, no FOB)** |
| 7 | `<EconomicsWaterfall>` updates live: `sell → −opex(49%) → landed [Target col live, indigo accent ring] → net/unit (each suffixed %)`; PASS/headroom lamp |
| 8 | Optional: adjust **target landed** directly (input or slider) → calculator back-solves headroom |
| 9 | **Notes** field → free text (`selections.notes`) |
| 10 | Auto-save → item appears on `/shortlist` (Pursue view) + feeds `/board` headroom sort + `/dashboard` worklist |

◆ **Decisions:** Pursue / Maybe / Pass · enter target sell *vs* target landed first · grid *vs* table · peek *vs* full PDP.

| Edge / failure | Branch |
|---|---|
| `sell = 0` / blank | Waterfall renders `—` everywhere (guard); lamp neutral "Set a target sell" (slate + —) |
| **No factory quote** (appliances/beauty start with none) | Live column falls back to **Target**; "Factory quote" block shows **"Awaiting quote"** empty state |
| **No competitors** yet | Competitor region shows empty / **"Run discovery"** affordance |
| Image `clean-photo-needed`/`reshoot`/`missing` | Branded **"Studio photo pending"** placeholder + `PhotoStateBadge` (camera glyph) — never broken-image icon |
| **220 V** appliance (46/70) | Amber **"220 V — US-sourcing landmine"** flag (with its own label) in Deal Panel |
| Partner tries to edit a `factory_quote`/spec | **Lock glyph** + "set by {memberName}" caption; read-only |
| gross/net confusion risk | "65% gross" and "≈16% net" never adjacent, never same color, always suffixed |
| Network save fails | Optimistic UI + retry; toast on failure; value preserved locally |

#### B2 — Partner manages the shortlist (Pursue working set) *(Cockpit-leaning)*

| # | Screen → component / action |
|---|---|
| 1 | `/shortlist` → saved **"Pursue"** view (all `selections.tier=pursue`) |
| 2 | Row → **re-tier** (Pursue→Maybe→Pass), inline-edit target sell/landed, edit notes |
| 3 | Re-tier to **Pass** → removes from shortlist; updates `/board` + `/dashboard` Pursue worklist |

| Edge | Branch |
|---|---|
| Empty shortlist | Empty-state CTA "Browse the catalog to add Pursue items" → `/catalog` |
| Item later quoted by owner | Row reflects live **PASS/FAIL** once quote imported |

#### B3 — Partner moves pipeline (role-gated)

| # | Screen → component / action |
|---|---|
| 1 | `/pipeline` → shared Kanban: **New → Shortlisted → Costing → Quoted → Decision** |
| 2 | Partner may drag **New ↔ Shortlisted** only; **either role → Decision** (Go/Hold/Pass) |
| 3 | Realtime broadcasts move; append-only `activity` audit row written |

| Edge / failure | Branch |
|---|---|
| Partner attempts Costing/Quoted transition | Drop rejected; column shows **lock glyph**; tooltip "Owner advances costing" |
| Concurrent move by owner | Realtime **last-write** reconciles; card snaps to synced column |
| Drag into Decision | **Go/Hold/Pass** sub-state picker appears |

---

### C. Owner (cost-side) core flows

#### C1 — Pursue worklist → multi-select → build Factory RFQ → export Excel + PDF → send *(Cockpit)*

**Trigger:** Owner opens `/dashboard`. **Actors:** Owner; System (export).

| # | Screen → component / action |
|---|---|
| 1 | `/dashboard` → KPI cards + **selections table** (Pursue worklist, visible to both) |
| 2 | Owner **multi-selects** rows (checkbox column) → **"Build Factory RFQ"** (owner-only) |
| 3 | `/exports` **RFQ builder drawer** → **previewable** builder; columns: name / model / specs / image / target-landed-DDP / MOQ-ask / target-sell / competitor-ref-prices / notes |
| 4 | System **excludes** images flagged Chinese-text / text-overlay / wrong-product (`reshoot` + wrong-product **quarantined**) |
| 5 | Owner reviews preview → **Export Excel** (`exceljs`, image-embedded) + **Export PDF** |
| 6 | System **snapshots `calc_inputs`** at export time (frozen targets) |
| 7 | Owner downloads / sends to factory (out-of-app send) |

◆ **Decisions:** which rows · include/exclude per-row · Excel and/or PDF · MOQ-ask values.

| Edge / failure | Branch / UI state |
|---|---|
| Selected product has only flagged/`reshoot` images | Exports with placeholder, image cell omitted; warning chip (camera glyph) in preview |
| Wrong-product image (the 1 appliance) | **Quarantined** — never embedded |
| Sparse data (no model / no specs; 8 no model, 2 no features) | Cell **blank**, not "undefined"; preview flags "missing model" |
| **`api/export` or `api/rfq` failure** | `exceljs`/PDF error → **toast + retry**; partial file never delivered; timeout → "Export is taking longer than expected — retry"; 429/quota → "Too many exports — try again shortly" |
| Partner tries "Build RFQ" | Action hidden/locked (owner-only) |
| Zero rows selected | Build button disabled |

#### C2 — Receive quotes → import CSV (or inline enter) → PASS/FAIL + headroom flip live *(Cockpit)*

**CSV path**

| # | Screen → component / action |
|---|---|
| 1 | `/exports` → **quote-import CSV dropzone** (`api/import/quotes`) |
| 2 | Map by **`external_ref`** → rows → `factory_quotes` (`landed_cost_ddp`, `moq`, `lead_time_days`, `supplier`, `is_selected`) |
| 3 | System recomputes margins **app-wide live** → waterfall **Quoted** becomes live column (**amber, file-text glyph**, accent ring) |
| 4 | PASS/FAIL lamp + headroom **flip live** on PDP, `/board`, `/dashboard`, `/catalog` facets |

**Inline path**

| # | Screen → component / action |
|---|---|
| 1 | `/dashboard` selections table **or** `/products` row → **inline Enter-quote** field (pencil glyph, neutral) |
| 2 | Owner types `landed_cost_ddp` → **Enter** → `factory_quotes` upsert |
| 3 | Same live recompute & lamp flip as CSV |

◆ **Decisions:** CSV vs inline · which quote `is_selected` when multiple suppliers · accept worse-than-target (FAIL) or renegotiate.

| Edge / failure | Branch / UI state |
|---|---|
| `external_ref` no match | Reported in import diff as **"unmatched"**; skipped, surfaced for review |
| Duplicate / re-import | **Idempotent upsert**; `is_selected` supplier wins |
| Quote **> target landed** | Lamp → **FAIL (rose + ✕)**; headroom negative, shown explicitly |
| Quote **within target** | Lamp → **PASS (emerald + ✓)**; headroom positive |
| Malformed CSV (bad columns) | Dropzone validation error; mapping step blocks bad rows |
| **`api/import/quotes` failure** | Timeout → "Import didn't finish — retry"; 429 → cooldown; server error → toast + retry, **nothing partially applied** |
| Multiple suppliers per product | Selected one drives waterfall; others retained for comparison |
| Partner attempts quote entry | Field **locked** + "set by {memberName}" caption |

#### C3 — Owner advances pipeline costing (role-gated)

| # | Step |
|---|---|
| 1 | `/pipeline` → owner drags **Costing → Quoted** (and New→Shortlisted→Costing); owner-only transitions |
| 2 | Either role then drags → **Decision** → Go/Hold/Pass |
| 3 | Realtime sync + `activity` audit row |

| Edge | Branch |
|---|---|
| Advance to Quoted with no quote | Allowed but card flagged **"no quote"** (soft-warn) |
| Realtime conflict w/ partner's New↔Shortlisted | Reconciled by last-write; audit preserves **both** events |

---

### D. Calculator & assumptions flows

#### D1 — Global-assumption change → ripple across catalog / board / dashboard *(Cockpit)*

**Trigger:** Owner edits global cost-stack / target-margin. **Actors:** Owner (write); System + Realtime (ripple); Partner (observer).

| # | Screen → component / action |
|---|---|
| 1 | `/settings/assumptions` → **`<CostStackEditor>`** (single-row global `assumptions` + per-LINE profiles) |
| 2 | Owner edits opex line(s) / gross-margin target / partner-split |
| 3 | System recomputes all target landeds **where no per-product override exists** |
| 4 | **Optimistic local + Realtime sync** → ripples to `/catalog` facets, `/board` headroom sort, `/dashboard` KPIs, every PDP waterfall |
| 5 | Partner sessions receive Realtime broadcast → values update live **without reload** |

| Edge / failure | Branch |
|---|---|
| Products with per-product override | **Untouched**; retain **violet "Overriding global"** chip (hollow ring) |
| Partner viewing during change | Numbers shift live; caption "set by {memberName} · now" |
| Save fails mid-ripple | Optimistic value **rolls back**; toast; consistent state restored |
| gross/net adjacency guard | Editor keeps **65% gross** separate from **49% opex** so **net ≈16%** stays distinct & suffixed |
| Partner tries to edit assumptions | Owner-only; **locked** with glyph |

#### D2 — Per-product calculator override → reset *(Storefront PDP / Deal Panel)*

| # | Screen → component / action |
|---|---|
| 1 | `/p/[slug]` Deal Panel → **"Override assumptions"** → per-LINE/per-product `assumptions` profile + `selections.calc_inputs` |
| 2 | Edit opex/margin **for this product only** → live recompute (waterfall instant) |
| 3 | **Violet "Overriding global"** chip appears next to affected values |
| 4 | Global changes (D1) **no longer ripple** to this product |
| 5 | **Reset** → override cleared → reverts to global → chip disappears → re-subscribes to ripple |

◆ **Decision:** override which inputs (opex vs margin) · reset full vs partial.

| Edge | Branch |
|---|---|
| Override then global changes | Product stays on override; violet chip is the signal |
| Reset with no override present | Reset hidden/disabled |
| Override authorship | Caption shows who set it; other role sees **lock** if not their gate |

---

### E. Competitor discovery pipeline (user-facing)

#### E1 — Trigger discovery → candidates "needs review" → approve / reject-with-reason → reason improves search → re-run *(Storefront PDP, competitor region)*

**Trigger:** Owner triggers discovery for a product. **Actors:** Owner (curates); System AI stages (Keepa + Claude) via `api/ai/*`, `api/enrich/keepa`.

| # | Screen → component / action |
|---|---|
| 1 | `/p/[slug]` → competitor section → **"Find competitors"** (uses/writes `search_profiles` recipe) |
| 2 | **[0]** Keepa `search_for_categories` → Claude picks node (`api/ai/discover`) |
| 3 | **[1]** Claude/Sonnet builds Keepa Finder query from specs + `exclude_terms` |
| 4 | **[2]** PRIMARY = **Keepa Product Finder** (real top-selling ASINs) + SECONDARY = Claude `web_search` identical-item |
| 5 | **[3]** verify — **Haiku structured judge gates before UI** (`api/ai/verify`; low-confidence filtered out) |
| 6 | **[4]** enrich via Keepa `/product` (`api/enrich/keepa`) |
| 7 | UI → candidates render as **competitor mini-pages** with status **candidate / "needs review"**: image, title, marketplace badge, ASIN (mono), price (mono), ★ rating (reviews), est. monthly sales, BSR, outbound link — **no min/median/max price-range bar** (removed per user) |
| 8 | Owner reviews each → **Approve** (`status→approved`) or **Reject with reason** (`status→rejected`; `competitor_feedback` captured) |
| 9 | **[5]** Reject reason **learns into `search_profiles`** (versioned recipe bump) |
| 10 | Owner **re-runs** → improved query → new candidates; rejected items **not resurfaced** |

◆ **Decisions:** pick category node (auto/confirm) · approve vs reject · reject-reason taxonomy ("not a fit" + free reason) · re-run vs accept set.

| Edge / failure (each `api/ai/*` mapped to a UI state) | Branch |
|---|---|
| **`ai/discover` / Keepa returns zero ASINs** | Empty **"No candidates"** state + suggest broadening `exclude_terms` |
| **`ai/verify` gate rejects all** | Nothing reaches UI; **"Needs a better query"** prompt → open Search-profile editor (E1-a) |
| **`enrich/keepa` API error / quota (429)** | Toast + retry; **partial enrich tolerated** — candidates without BSR show `—` |
| **`web_search` tool error** (secondary) | Degrade gracefully to Keepa-only results; banner "Web search unavailable — showing Keepa matches" |
| Web-search finds near-but-not-identical | Surfaced as candidate; owner rejects → feedback |
| Wrong-product / Chinese-text competitor image | Shown but flaggable; excluded downstream where relevant |
| Partner triggers discovery | **Owner-gated**; partner read-only on results |
| Duplicate ASIN already approved | **De-duped**; not re-added |
| Re-run after feedback | Versioned `search_profiles` ensures learning applied; rejected reasons excluded |
| **`ai/cleanup` / `ai/vision-qa` / `ai/taxonomy` timeout** | Per-row spinner → "Couldn't process — retry"; owner-reviewed, never auto-applied silently |

#### E1-a — Search-profile editor (PDP advanced drawer)

> **Surface:** a PDP **advanced drawer** exposing the versioned per-product **`search_profiles`** recipe (category node, generated Keepa Finder query, `exclude_terms`, version history). **Cross-linked** from the E1 candidate-review flow at steps 5/9 ("Needs a better query" / after reject-with-reason) so the owner can hand-tune the recipe and re-run.

| # | Screen → component / action |
|---|---|
| 1 | PDP → "Find competitors" overflow → **"Edit search recipe"** → advanced drawer |
| 2 | Drawer → category node (override Claude's pick), Keepa Finder query (editable), **`exclude_terms`** chips, recipe **version** list |
| 3 | Owner edits → **Save** bumps `search_profiles` version → **"Re-run with this recipe"** → returns to E1 step 4 |

| Edge | Branch |
|---|---|
| Owner saves identical recipe | No version bump; re-run reuses current |
| Partner opens drawer | Read-only (owner-gated); fields show lock glyph |
| Revert to prior version | Picks an older `search_profiles` row → re-run uses it |

---

### F. Import / data-cleaning flows

#### F1 — Import appliances + beauty JSON (idempotent, dry-run diff) *(Cockpit, owner-only)*

**Trigger:** Owner runs the importer on `/import`. **System:** `api/import/products`.

| # | Screen → component / action |
|---|---|
| 1 | `/import` (owner-only) → source = appliances/beauty JSON → upload |
| 2 | **Dry-run** → **diff view** (creates / updates / unchanged / conflicts) keyed by `external_ref` |
| 3 | **Data-cleaning review** surfaces: **45/57** beauty images w/ Chinese text, **24** `needs_clean_photo`, **46/70** appliances **"220 V"**, **1** wrong-product image, sparse rows (4 beauty no specs, 8 no model, 2 appliances no features) |
| 4 | Owner reviews → **Apply** → idempotent upsert to `products` / `product_images` |
| 5 | Post-import: photo-state set `good | clean-photo-needed | reshoot | missing`; 220V flagged; wrong-product image **quarantined** from exports |

◆ **Decisions:** apply vs cancel · per-row include · trigger Claude spec/copy **cleanup** (Chinese → US English, 220V flag) · **vision image QA** · **taxonomy** normalization.

| Edge / failure | Branch |
|---|---|
| Re-run same file | **Idempotent** — diff shows all "unchanged"; no dupes |
| Malformed JSON | Validation error **pre-diff**; nothing applied |
| Conflict (field changed in-app vs file) | Flagged in diff; owner chooses |
| Images missing | `missing` state → placeholder, never broken icon |
| **`api/import/products` failure** | Timeout / server error → "Import didn't complete — nothing was applied"; retry from diff |
| Partner reaches `/import` | **403** (owner-only) |

#### F2 — Import Greenway from Servous (real Actual costs)

| # | Step |
|---|---|
| 1 | `/import` → Greenway/Servous source (`api/import/greenway`) → upload → dry-run diff |
| 2 | Greenway is **the only line with real Actual cost** → waterfall **Actual** column populated |
| 3 | Apply → `products` + Actual landed feeds `<EconomicsWaterfall>` (Actual becomes live column when no Quoted) |

| Edge | Branch |
|---|---|
| Servous schema drift | Mapping validation; diff flags unmapped columns |
| **`api/import/greenway` failure** | Toast + retry; partial import not applied |
| Appliances/beauty start NO cost / NO competitors | Expected; Actual column `—` until quotes arrive |

#### F3 — Quote-import round-trip & bulk import entry

`/exports` → **quote-import CSV dropzone** → `api/import/quotes` → map `external_ref` → `factory_quotes`. **Bulk import entry** also available on `/exports`. Live PASS/FAIL flip and all edge cases are identical to **C2** (idempotent upsert, unmatched-ref diff, malformed-CSV validation, 429/timeout UI states).

---

### G. Realtime / co-editing & system flows

#### G1 — Both open same product → concurrent edit on adjacent fields *(PDP)*

**Trigger:** Owner and Partner have the same PDP open; one edits a shared/adjacent field. **Actors:** Owner, Partner; Realtime.

> **Design resolution (field-ownership makes true merge-conflicts rare):** because Partner owns `selections` (Targets) and Owner owns `factory_quotes`/specs/assumptions, a cross-role "conflict on target sell" is **not a merge conflict** — it is the Owner *observing* a **locked, live-rippling** field. True same-field contention is only possible **same-role / two-tabs**, resolved **last-write-wins** with audit of both events.

| # | Screen → component / action |
|---|---|
| 1 | Both on `/p/[slug]` → **presence** indicator shows the other user active |
| 2 | Partner edits **target sell** (their gate). Owner sees the field with **lock glyph** + "set by {memberName}" — cannot edit it |
| 3 | Realtime broadcasts partner's new value → owner's waterfall recomputes live |
| 4 | Both editing fields **they each own** (partner: Targets; owner: factory_quote) → **no conflict**; both ripple independently |
| 5 | Same field edited by same role on two devices → **last-write-wins**; `activity` logs both; UI snaps to synced value |

◆ **Decision:** field ownership decides whether a conflict is even possible (gates prevent most).

| Edge / failure | Branch |
|---|---|
| Simultaneous same-field edit (same role, 2 tabs) | Optimistic local → Realtime reconciles to last write; toast **"Updated by you elsewhere"** |
| Stale value submitted | **Server value wins**; field re-syncs; no silent overwrite of newer data |
| Connection drop mid-edit | Optimistic local retained; reconnect → re-sync; conflict resolved last-write |
| Comment posted concurrently | **Append-only** `comments`; both appear (no conflict) |
| Pipeline move race | Reconciled per B3 / C3 |

#### G2 — "Preview as Partner" (owner client-only)

> **Design resolution:** purely client-side **visual simulation** — **no server-side role downgrade**, so all writes are **suppressed/blocked** while previewing (preview is a read-simulation).

| # | Step |
|---|---|
| 1 | App shell / role-badge area → **"Preview as Partner"** toggle |
| 2 | Client re-render: owner-edit affordances become **locked glyphs**; owner-only routes/actions (RFQ build, assumptions, members, import) hidden as a partner would see |
| 3 | Owner inspects partner experience (Targets editable-looking, quotes locked) |
| 4 | Toggle off → returns to full owner powers |

| Edge | Branch |
|---|---|
| Owner tries to save while previewing | **No write occurs** (client-only) — blocked read-simulation |
| Navigates owner-only URL while previewing | Hidden in nav; **direct URL still works** for owner (preview is visual, not a real downgrade) |

#### G3 — ⌘K command palette (cross-cutting)

| # | Step |
|---|---|
| 1 | `(app)` → **⌘K** → palette opens → search products / jump to routes (`/board`, `/pipeline`, `/dashboard`, `/exports`, `/shortlist`, settings) |
| 2 | Select product → navigate to PDP; select route → navigate |
| 3 | **Owner-only destinations hidden** from partner's palette results |

| Edge | Branch |
|---|---|
| No match | **"No results"** empty state |
| Partner searches owner-only route | Not listed |

---

### H. Cross-cutting / supporting flows (enumerated for completeness)

| Flow | Trigger → key steps → end-state | Notable edges |
|---|---|---|
| **Catalog faceted filtering** | `/catalog` → toggle facets (line, tier, has-quote, 220V, image-state, headroom, net%) → **all state in URL** → shareable/bookmarkable | Empty set → "No products match"; stale facet in URL gracefully ignored |
| **Grid ↔ Table toggle** | `/catalog` → switch view; selection/filter preserved | — |
| **PDP peek navigation** | `(.)p/[slug]` Sheet → **↑/↓ prev/next** within filtered set, **Esc** closes to scroll position | At list ends, ↑/↓ stops; direct `/p/[slug]` deep-link opens **full** PDP (not peek) |
| **Slug resolution across lines** | `/p/[slug]` resolves via `products.external_ref` across appliance/beauty/Greenway lines | Unknown slug → 404 product not found |
| **Board comparison & Kanban toggle** | `/board` → dense **virtualized** table, sort by headroom/net% → `?mode=` toggles Kanban | Virtualized scroll perf for ~152 rows; empty board state |
| **Editable products list** | `/products` → inline-edit tier / target sell / factory quote per row (no page open); gates per field | Partner edits target/tier only; quote field **locked** (lock glyph) for partner |
| **Comments / discussion** | PDP/board → post comment → `comments` + Realtime broadcast + presence | **Append-only**; both roles read+write comments |
| **Activity / audit** | Every edit/move → append-only `activity` row; **captions derive from it** ("set by {memberName} · {relativeTime}") | Immutable; powers lock-glyph captions |
| **Exports (filtered data)** | `/exports` → filtered CSV/Excel of catalog/board → download | Empty filter → **warn before exporting all**; `api/export` failure → toast + retry |
| **Decision sub-state (Go/Hold/Pass)** | `/pipeline` Decision column → pick Go/Hold/Pass → `pipeline_status` | **Either role** may set Decision; audit logged |
| **Members management** | `/settings/members` → invite/resend/revoke/change-role | Owner-only; **can't demote/remove last owner** |
| **Image-state lifecycle** | Importer/vision-QA sets `good \| clean-photo-needed \| reshoot \| missing` → **"Studio photo pending"** placeholder; `reshoot` excluded from RFQ export | Wrong-product image **quarantined**; never broken-image icon; consistent across `PhotoStateBadge`/`StudioPhotoPending`/`ImageGallery`/`VisionQaBadge` |
| **AI spec/copy cleanup** | `api/ai/cleanup` → Chinese text → US English, 220V flag, taxonomy normalize, vision image QA | Owner-reviewed; partner read-only; per-call failure → "Couldn't process — retry" |
| **Sign-out / session expiry** | Top bar → sign out → `/login`; expired session anywhere → bounce `/login` (A4 if from link) | Mid-edit expiry → optimistic local lost on hard redirect; **toast warns** |
| **403 / route-guard (partner on owner-only)** | Partner hits `/settings/members`, `/import`, RFQ build → guard → redirect/403 | **Nav items hidden**, not just blocked |
| **Empty / first-run states (per line)** | Appliances/beauty land with **no cost, no competitors** → Awaiting-quote + Run-discovery affordances; Greenway lands with **Actual** populated | Distinct empty copy per data reality so blank ≠ error |

---

### 2.2 Flow-level testing & verification matrix *(QA coverage map — every flow has a named test surface)*

> Folded-in per critique: each flow group is paired with the **test type, instrument, and the critical assertion** that proves it. Stack-appropriate: Playwright for E2E, RLS/policy tests for role gates, deterministic unit tests for the calculator (no network), Realtime integration tests for co-editing.

| Flow(s) | Test type | Instrument | Critical assertion(s) |
|---|---|---|---|
| A1–A4 onboarding/auth | E2E + auth integration | Playwright + Supabase test project | Magic-link callback mints session; **non-enumerating** login copy; partner **403** on `/settings/members`; last-owner demotion blocked |
| B1 calculator math | **Unit (deterministic, no network)** | Vitest/Jest on calc module | `landed ≤ 35%` of sell at 65% gross; opex = 49%; **net ≈16%**; `sell ≤ 0` → `—` (never `NaN`/`$0`); gross/net never coalesced |
| B1/B3, C3 role gates | **RLS / policy tests** | Supabase policy test harness | Partner can write `selections` + `New↔Shortlisted` only; Owner-only writes to `factory_quotes`/`assumptions`/`Costing→Quoted`; both READ all |
| C1 RFQ export | E2E + golden-file | Playwright + `exceljs`/PDF snapshot | Flagged/wrong-product images **excluded**; `calc_inputs` snapshot frozen; `api/export` failure → toast + retry, **no partial file** |
| C2 / F3 quote import | E2E + idempotency | Playwright + CSV fixtures | Map by `external_ref`; unmatched rows surfaced; **idempotent re-import**; PASS/FAIL lamp flips live with correct glyph (✓/✕) |
| D1 global ripple | Realtime integration | Two Playwright contexts | Override'd products **untouched** (violet chip persists); non-override values ripple live to second session; rollback on save failure |
| D2 override/reset | E2E | Playwright | Violet "Overriding global" chip appears; global change does **not** ripple; reset re-subscribes |
| E1 / E1-a discovery | Integration + mocked AI | Playwright + mocked `api/ai/*`, Keepa | Verify-gate filters low-confidence **before UI**; reject reason bumps `search_profiles` version; rejected ASINs not resurfaced; zero-result + tool-error UI states render |
| F1/F2 import | Integration + idempotency | Playwright + JSON/Servous fixtures | Dry-run diff (creates/updates/unchanged/conflicts); re-run → all "unchanged"; photo-state enum set correctly; 220V flagged; wrong-product quarantined |
| G1 co-editing | Realtime integration | Two contexts | Cross-role = lock + live ripple (no merge conflict); same-role two-tab = last-write-wins + audit of both |
| G2 Preview-as-Partner | E2E (client-only) | Playwright | Writes **suppressed** while previewing; owner-only nav hidden; direct owner URL still resolves |
| G3 ⌘K palette | E2E | Playwright | Owner-only destinations absent from partner results; "No results" empty state |
| H accessibility/color | Automated a11y + visual | axe-core + visual snapshots | Every color state carries a **redundant glyph/label** (colorblind-safe); amber meanings disambiguated by glyph (file-text/pencil/camera/●) |
| All `api/*` failures | Fault-injection | Mocked 429 / timeout / 5xx / tool-error | Each route (`rfq, export, import/quotes, import/products, import/greenway, enrich/keepa, ai/discover, ai/verify, ai/cleanup, ai/vision-qa, ai/taxonomy`) maps to a **visible** retry/toast/empty UI state — never a silent failure or blank screen |

---

## 3. Component inventory (with states)

> This documents the **decided** design, not a redesign. Every reusable UI component is organized by domain. For each: name · shadcn base · where used · props/variants · and **all** states. The recurring **role-locked read-only state** is the canonical `value chip + lock glyph + authorship caption` pattern (rendered by `<FieldLock>`), shown wherever a field is editable by only one role.

### 3.0 System-wide rules baked into every component

**Two registers govern every component.** **Storefront** = light, roomy, imagery-forward (`/login`, `/catalog`, `/p/[slug]`). **Cockpit** = dense, hairline dividers, virtualized, dark-capable later (`/products`, `/board`, `/pipeline`, `/dashboard`). Many components accept `register?: 'storefront' | 'cockpit'`.

**Universal token rules** (value-bearing components): mono + `tnum` for all money / % / spec / SKU / model / ASIN / external_ref; semantic color always carries a **redundant glyph/label** (colorblind-safe); the `sell > 0` guard renders an em-dash `—`, **never** NaN or `$0`; gross (indigo, suffixed "gross") and net (slate/neutral, suffixed "net") are **never adjacent, never the same color, always suffixed**.

**Color is pinned to one meaning each** (no aliasing):

| Token | Reserved meaning | Mandatory glyph |
|---|---|---|
| **Indigo** | **Target** column **and** focus-visible ring — nothing else | (Target) ◐ / focus = ring only |
| **Violet (hollow ring)** | **Partner / market side / per-product override / terminology** — the *only* violet meanings | ◆ hollow |
| **Amber** | overloaded — disambiguated by glyph below | see matrix |
| **Slate** | Actual (landed) / net | ▭ |
| **Emerald** | PASS / Go | ✓ |
| **Rose** | FAIL / quarantine-blocked | ✗ |

**Amber-overload disambiguation matrix** (no two amber meanings may sit adjacent without a distinct glyph **and** label):

| Amber meaning | Mandatory glyph | Rendering note |
|---|---|---|
| **Quoted** column | `file-text` | amber *fills* mean Quoted only |
| **Owner-edit affordance** | `pencil` | rendered **pencil on neutral**, not an amber fill, to keep fills = Quoted |
| **Needs-photo flag** | `camera` | on `<PhotoStateBadge>` / `<VoltageBadge>` is separate (bolt) |
| **Owner role-dot** | filled `●` | paired with the literal label "Owner" |

**Neutral / unbranded rule (design-system law):** no literal partner or owner brand name appears anywhere in the UI, fixtures, or component defaults. **Authorship captions are runtime-injected** — always write `"set by {memberName} · {relativeTime}"` (e.g. "set by {memberName} · 2d ago"), never a hard-coded name. The two Deal Panel blocks are labeled **"Targets"** and **"Factory quote"**, never "Partner sets" / "Owner enters".

**Canonical photo-state enum** — one source of truth consumed identically by `<PhotoStateBadge>`, `<StudioPhotoPending>`, `<ImageGallery>`, and `<VisionQaBadge>`:

| `photoState` | Trigger | Vision-QA verdict → state mapping | UI |
|---|---|---|---|
| `good` | clean US-English studio image | `good` → `good` | no badge / subtle |
| `clean-photo-needed` | Chinese text / text-overlay present (24 beauty SKUs flagged `needs_clean_photo`) | `foreign-text` → `clean-photo-needed`; `lifestyle` → `clean-photo-needed` (info) | amber + camera glyph; `export_ok=false` |
| `reshoot` | image unusable / off-spec, must be re-shot | (manual) → `reshoot` | amber + camera glyph (stronger) |
| `missing` | no usable image at all | (no image) → `missing` | `camera-slash` → renders `<StudioPhotoPending>` |
| *(quarantine overlay)* | wrong-product image (1 appliance) | `wrong-product` → quarantined | rose, blocks export, owner-review banner |

**Universal interaction states** every interactive component supports unless noted, enumerated explicitly per component below: `default · hover · focus-visible (indigo ring) · active/pressed · disabled · loading/skeleton · empty · error`.

**Catalog-scale facts** baked into empty/aggregate states: **~152 products = 70 RoyalStar appliances + 57 beauty/personal-care + 25 Greenway foodservice**; **45/57 beauty images contain Chinese text** (24 flagged `needs_clean_photo`); **46/70 appliances list "220 V"**; **1 appliance has a wrong-product image**. Greenway is the only line with a real **Actual** cost; appliances/beauty start with **no cost and no competitors**.

**Custom (non-shadcn) components:** `<EconomicsWaterfall>` and `<CostStackEditor>` are the two bespoke signature components. All others sit on shadcn/ui bases (recommended, not contractually fixed).

---

### 3.A — Shell & global chrome

| Component | shadcn base | Where used | Props / variants | States (all) |
|---|---|---|---|---|
| **`<AppShell>`** | layout (Sidebar/flex) | `(app)/layout` wraps every authenticated route | `register`, `children`, `topBar`, `nav` | default; **storefront** vs **cockpit** density; **mobile** (collapsed nav + drawer); **scroll-shadow** on top bar; **Realtime-disconnected** banner (amber, "Reconnecting…"); **loading** (route-segment skeleton); **error** (segment error boundary) |
| **`<TopBar>`** | custom + `Button`/`Avatar` | top of `<AppShell>` | `user`, `role`, `onOpenPalette` | default; **scrolled** (hairline divider appears); `⌘K` search hint; presence-cluster slot; **disconnected** (amber realtime dot); compact (mobile) |
| **`<RoleBadge>`** | `Badge` + `Tooltip` | top bar, comments, authorship captions | `role: 'owner'\|'partner'`, `size`, `withLabel`, `preview?` | **owner** (amber filled `●` + "Owner"); **partner** (violet hollow `◆` + "Partner"); **preview-as-partner** active (violet outline + "Previewing as Partner" + exit affordance); hover tooltip (display name + email, runtime-injected); colorblind glyph always present |
| **`<PreviewAsPartnerToggle>`** | `Toggle` + `Tooltip` | owner-only, top bar / settings | `active`, `onToggle` | off (default, owner-only visible); **on** (entire UI switches partner-locked, persistent violet banner "Previewing as Partner — your edits are disabled", client-only); never rendered for partner |
| **`<CommandPalette>` (`⌘K`)** | `Command` (cmdk) | global | `commands`, `recent`, `onSelect` | closed; **open/default**; **typing/filtering**; **loading** (async product-result spinner); **empty** ("No results"); grouped sections (Navigate / Products / Actions / Saved views / **Search profiles**); **keyboard-active** highlighted row; recent items on empty query; deferred Phase-3 **NL catalog-search hint row** (single affordance, not yet wired) |
| **`<PresenceDots>`** | `Avatar` stack + `Tooltip` | top bar, pipeline, PDP, board headers | `members[]`, `max`, `context` | **alone** ("Only you here"); **co-present** (stacked avatars, live); **viewing-same-record** highlight ring; **idle** (dimmed); **disconnected** (greyed, "Realtime offline"); tooltip "name · viewing X" |
| **`<NavRail>` / `<NavItem>`** | Sidebar / `Button` | shell nav | `items`, `activePath`, `role` | default; **active** (route match, indigo); hover; **owner-only items hidden** for partner (`/settings/members`, `/import`); **badge counts** (needs-photo to-dos, Pursue count, candidate-review count); collapsed (icon-only) |
| **`<ToastHost>` / toasts** | `Sonner` | global | `type`, `message`, `action?` | success (emerald ✓); error (rose ✗); info; **loading→resolved** ("Importing…" → "Imported"); **undo** variant (tier/quote/pipeline change); realtime-event toast ("{memberName} moved 3 items to Shortlisted") |
| **`<RouteErrorBoundary>` / `<NotFound>`** | custom | per segment | `error`, `reset` | error (with retry); 404 (neutral, "Product not found"); permission-denied (partner hitting owner route → friendly redirect) |

---

### 3.B — `<FieldLock>`: the role-lock primitive (used everywhere)

`<FieldLock>` wraps any editable value to encode the full-transparency / role-gated-edit model. shadcn base: `Tooltip` + `Badge` + child input. It is the single most-reused state machine in the app.

| Prop | Meaning |
|---|---|
| `canEdit` | from `useCanEdit()` / capability map (data source only — capability logic lives in another slice) |
| `value`, `formatted` | the mono/`tnum` display value |
| `author`, `editedAt` | drive the **runtime-injected** caption `"set by {memberName} · {relativeTime}"` |
| `field`, `record` | for the activity caption + optimistic write |
| `children` | the live editor (input/slider/select) when `canEdit` |

| State | Rendering |
|---|---|
| **Editable — default** | live control (child); subtle author caption below; owner-edit affordance = **pencil on neutral** (never amber fill); no lock |
| **Editable — hover/focus** | indigo focus ring; caption persists |
| **Editable — dirty/saving** | spinner or "Saving…" micro-label; optimistic value shown |
| **Editable — saved** | brief emerald check, fades; caption updates to "you · just now" |
| **Editable — error** | rose ring + inline "Couldn't save — retry"; value reverts on hard fail |
| **ROLE-LOCKED read-only (signature state)** | **value chip** (mono, `tnum`) + **lock glyph** 🔒 + **authorship caption** `"set by {memberName} · {relativeTime}"`; no input affordance; tooltip "Only the Partner can edit this" / "Only the Owner can edit this" |
| **Empty (editable)** | placeholder ghost ("Set target sell") + add affordance |
| **Empty (locked)** | em-dash `—` chip + lock + "not set yet" |
| **Loading** | skeleton chip |

---

### 3.C — Catalog (Storefront)

| Component | shadcn base | Where | Props / variants | States |
|---|---|---|---|---|
| **`<CatalogToolbar>`** | `Tabs` + `Button` + `Input` | `/catalog` top | `view: 'grid'\|'table'`, `query`, `sort`, `count`, `onViewChange` | default; **grid** vs **table** toggle active; **searching** (debounced spinner); live **results count**; sort dropdown open; **sticky/scrolled**; empty-query vs active-query; sort disabled while loading |
| **`<FilterRail>`** | `Accordion` + `Checkbox` + `Slider` | `/catalog` left rail | `facets[]` (Line→Group→Subsection, Brand, Tier, Pipeline, Has-quote, Photo-state, Price band), `counts`, `urlState` (**all filter state in URL — shareable**) | default; **live counts** per value; **active** facet highlighted (violet for tier/partner facets, indigo for Target-derived); **zero-count** facet (dimmed/disabled); **loading** counts (skeleton numbers); **collapsed** (mobile → Sheet); price-band slider drag; **cleared/empty** |
| **`<ActiveFacetChips>`** | `Badge` (removable) | below toolbar | `activeFilters[]`, `onRemove`, `onClearAll` | none active (hidden); 1–n chips with ✕; **"Clear all"** when ≥2; overflow ("+3 more"); chip hover (remove affordance); mirrors URL state exactly |
| **`<ProductCard>`** | `Card` | `/catalog` grid | `product`, `economics`, `presence`, `register` | **default**; **hover** (lift + quick-peek affordance); **focus** (indigo ring → opens peek); **loading/skeleton**; **photo states** (canonical enum: good / clean-photo-needed chip / reshoot / `<StudioPhotoPending>` for missing); **220 V** voltage badge (amber bolt); **tier** dot (Pursue/Maybe/Pass, glyphed); **completeness 3-dot** (Target/Quoted/Actual); selected (multi-select checkbox); **disabled/gated** (wrong-product SKU) |
| **`<EconomicsRibbon>`** (in `<ProductCard>`) | custom strip | grid cards, list rows | `target`, `quoted`, `actual`, `net`, `verdict` | **all-three present** (mini 3-col); **target-only** (appliances pre-cost — Quoted/Actual em-dash); **quoted present** (file-text glyph, accent ring on Quoted, PASS/FAIL micro-lamp); **actual present** (Greenway, slate); **none** (em-dashes, never `$0`); mono/`tnum`; loading shimmer |
| **`<CatalogTable>`** (virtualized) | `Table` + TanStack Virtual | `/catalog` table view | `rows`, `columns`, `sort`, `onRowOpen` | default (virtualized rows); **hover row**; **header sort** (asc/desc/none) on headroom / net% / price; **sticky header**; **loading** (skeleton rows); **empty** ("No products match"); **error**; **row → peek**; money cells mono/`tnum`; photo/voltage badge cells |
| **`<PeekSheet>`** | `Sheet` (intercepting route `(.)p/[slug]`) | `/catalog` row/card open | `slug`, `onPrev`, `onNext`, `onClose` | **opening** (slide-in); **loaded** (full Deal Panel inside); **loading** (PDP skeleton); **prev/next** (↑/↓ walk, edge-disabled at first/last); **Esc/close**; **error** (slug not found); deep-link fallback to full `/p/[slug]` |
| **`<SavedViews>`** | `Command`/`DropdownMenu` | catalog toolbar, ⌘K | `views[]`, `current`, `onSave`, `onApply` | none saved (empty → "Save current view"); list of saved views; **active** view checked; **dirty** (filters differ from saved → "Update view"); rename/delete; shareable-link copy state; loading |

---

### 3.D — Product Detail Page (PDP, Storefront-left)

| Component | shadcn base | Where | Props / variants | States |
|---|---|---|---|---|
| **`<ImageGallery>`** | `Carousel` + `Dialog` (lightbox) | PDP left, peek | `images[]`, `primaryIndex`, `exportFlags` | single image; **multi-thumb** strip; **hover** zoom hint; **lightbox open** (Dialog, object-contain on neutral tile); keyboard nav; **photo-state chip** (canonical enum); **export-excluded** marker on Chinese-text/overlay/wrong-product images; **`<StudioPhotoPending>`** when `missing`; loading skeleton; **quarantined wrong-product** (rose, blocked, owner-review banner) |
| **`<StudioPhotoPending>`** | custom placeholder | gallery, cards, exports fallback | `line`, `size` | branded "Studio photo pending" tile (never a broken-image icon); copy variants by state (`clean-photo-needed` / `reshoot` / `missing`); small (card) vs large (PDP); shimmer on first paint |
| **`<AtAGlanceStrip>`** | `Badge` row | PDP left, top | `chips[]` (parsed from specs) | populated chips (capacity, wattage, material…); **220 V** voltage chip (amber + bolt glyph, "needs 110–120 V check"); **sparse** (few/none → hidden gracefully, no empty box); loading skeleton chips |
| **`<SpecsTable>`** (owner inline-edit) | `Table` + inline `Input` | PDP left | `specs` (jsonb), `canEdit` (owner) | read-only (mono, `tnum`); **owner hover → editable** cell (pencil affordance); **editing** (inline input, autosave); **saved** (emerald tick); **stub rows** ("— needed for tier fee" for missing carton dims/weight); **missing-specs empty** (the 4 beauty no-spec SKUs → "No specs yet"); **role-locked** for partner (chip + lock + caption); error on save; loading skeleton |
| **`<FeatureList>` / selling-points** | list | PDP left | `features[]`, `canEdit`, `aiCleaned?` | populated bullets; **owner-editable**; **AI-cleaned** indicator (Chinese-text → US-English rewrite chip); empty ("No features yet"); role-locked for partner; loading |
| **`<ActivityFeed>`** | `ScrollArea` + items | PDP left bottom, dashboard | `events[]`, `realtime` | populated (append-only audit, newest first); **realtime** new-event slide-in; **empty** ("No activity yet"); grouped by day; load-more/pagination; loading skeleton |
| **`<Comment>` / `<CommentComposer>`** | `Textarea` + `Avatar` + `Button` | PDP, pipeline | `comment`, `author`, `canPost` | composer default; **typing**; **posting** (optimistic); **posted** (realtime echo); **empty thread** ("Start the conversation"); role badge on author; **error** (retry); edit/delete own only; loading |

---

### 3.E — Deal Panel & Economics (signature)

| Component | shadcn base | Where | Props / variants | States |
|---|---|---|---|---|
| **`<DealPanel>`** | `Card` (sticky/docked) | PDP right, `<PeekSheet>` | `product`, `selection`, `quote`, `assumptions`, `canEdit{owner,partner}` | **default** (market header → waterfall → lamp → **Targets** block → **Factory quote** block → pipeline → actions); **partner-view** (Targets live, Factory quote locked w/ chip+lock+caption); **owner-view** (Factory quote live, Targets locked); **preview-as-partner**; **loading** skeleton; **error**; **docked vs in-sheet** layout; **foodservice variant** (Actual present, Amazon opex marked N/A) |
| **`<MarketHeader>`** | custom 3-number header | top of `<DealPanel>` | `target`, `quoted`, `actual`, `verdict` | **three numbers** Target (indigo ◐) \| Quoted (amber file-text) \| Actual (slate ▭), each glyphed; **PASS/FAIL pill** (emerald ✓ / rose ✗) when quote present; **no-quote** (em-dashes, neutral "awaiting quote"); live-column emphasis; mono/`tnum`; loading; foodservice (Actual-led) |
| **`<EconomicsWaterfall>`** *(custom signature)* | custom | `<DealPanel>`, board detail, RFQ preview | `sell`, `opexPct`, `landed{target,quoted,actual}`, `net{…}`, `liveColumn`, `profile` | **full 3-column** (sell → −opex(49%) → landed[T/Q/A] → net/unit each w/ %); **live-column ring** (Quoted else Actual else Target, accent ring); **target-only** (Q/A em-dash); **quote-entered** (recompute, PASS/FAIL); **divide-by-zero guard** (sell ≤ 0 → "—" everywhere, never NaN); **gross≠net safeguard** (separated, different color, suffixed — gross indigo "gross" / net slate "net", never adjacent); **foodservice profile** (opex N/A, no fake net%); **recompute animation** (value tween on keystroke/slider); loading skeleton; error |
| **`<VerdictLamp>`** | custom + `Tooltip` | `<DealPanel>`, list rows, board, ribbon | `verdict: 'pass'\|'fail'\|'none'`, `headroom`, `size` | **PASS** (emerald lamp + ✓ + "+$1.50 headroom"); **FAIL** (rose lamp + ✗ + "−$X over target"); **none/awaiting** (neutral grey, "No quote yet — target $X"); **headroom readout** mono/`tnum`; hover tooltip with math; colorblind glyph mandatory; loading |
| **`<TargetsBlock>`** | `Card` section | `<DealPanel>` | `selection`, `canEdit` (partner) | **partner-editable** (tier, target sell, derived target landed [read-only derived], notes); **owner role-locked** (value chips + lock + `"set by {memberName} · {relativeTime}"`); **empty** (no selection → "Set targets"); **override chip** (violet hollow "Overriding global" + reset) when per-product override active; saving/saved/error; loading |
| **`<FactoryQuoteBlock>`** | `Card` section | `<DealPanel>` | `quotes[]`, `selectedQuote`, `canEdit` (owner) | **owner-editable** (quoted DDP, MOQ, lead time, supplier, `is_selected`); **partner role-locked** (chips + lock + caption); **empty/no-quote** (appliances start empty → "No factory quote yet — awaiting RFQ"); multiple-quotes selector; saving/saved/error; loading |
| **`<PipelineSelector>`** | `Select`/segmented | `<DealPanel>`, list rows | `status`, `decision`, `canTransition` | current stage; **allowed transitions only** (partner New↔Shortlisted; owner Costing→Quoted; either →Decision); **disabled** illegal transitions (greyed + tooltip "Owner advances this stage"); **Decision** sub-state (Go/Hold/Pass); realtime-moved (incoming-change toast); saving; error |
| **`<DealPanelActions>`** | `Button` group | `<DealPanel>` bottom | `onOpenCalculator`, `onAddToRfq` | default; "Open calculator" → `<CalculatorDrawer>`; **"Add to RFQ"** (toggles selected; "Added ✓"; disabled if no target landed); loading; **gated** (wrong-product image SKU → "Resolve image before RFQ") |

---

### 3.F — Calculator

| Component | shadcn base | Where | Props / variants | States |
|---|---|---|---|---|
| **`<CalculatorDrawer>`** | `Sheet`/`Drawer` | PDP "Open calculator", products list | `product`, `selection`, `assumptions`, `canEdit` | open/closed; **live recompute** on every keystroke/slider; **override mode** (violet hollow "Overriding global" chip + **Reset to global**); **autosave on settle** (saving→saved); **partner-locked** read-only (chips+lock) for owner; **divide-by-zero / sell=0** → em-dash outputs; **terminology helper** visible ("Gross margin (COGS vs price) ⇒ landed ≤ 35 % = $X target landed (DDP)"); error; loading |
| **`<CostStackEditor>`** *(custom signature)* | custom + `Slider`+`Input`+`Button` | `/settings/assumptions`, calculator drawer (per-product) | `costStack[]` (addable/removable %-lines), `grossMargin`, `scope: 'global'\|'product'`, `lineProfile` | **default** (referral 15 / ads 15 / FBA 15 / returns 4 rows + 0 % partner-split line = 49 % opex); **add line / remove line**; **slider drag** (live "= 49 % opex" total recompute); **gross-margin control** with the landed ≤ 35 % helper; **per-product override** (violet hollow chip + reset); **global scope** (warns "changes ripple to all non-overridden products"); **per-line profile** (foodservice → FBA opex N/A/disabled); **partner role-locked** (owner-governed → chips+lock); saving/saved; **validation error** (sum > 100 %, negative); loading |
| **`<MarginReadout>`** | custom | calculator, waterfall footer | `gross`, `net`, `targetLanded` | **gross** (indigo, suffixed "gross", landed ≤ 35 %); **net** (slate/neutral, suffixed "net", ≈ 16 %) — **never adjacent, never same color**; em-dash guard; mono/`tnum`; tween on change |
| **`<OverrideChip>` / `<ResetToGlobal>`** | `Badge` + `Button` | calculator, Targets block | `isOverridden`, `onReset` | none (hidden); **"Overriding global"** (violet hollow ring); reset hover/active; **reset confirm** (reverts `calc_inputs`); disabled when no override |
| **`<AssumptionsRipplePreview>`** | `Dialog`/inline | `/settings/assumptions` on save | `affectedCount`, `diff` | "This will recompute N non-overridden products" confirm; **overridden products excluded** note; applying (progress); applied (toast + realtime ripple); cancel; error |

---

### 3.G — Cockpit: Products list & Board

| Component | shadcn base | Where | Props / variants | States |
|---|---|---|---|---|
| **`<ProductsListRow>`** (inline-edit) | `Table` row + inline editors | `/products` | `product`, `selection`, `quote`, `canEdit{owner,partner}` | read-only row; **inline-edit tier** (partner; Select); **inline-edit target sell** (partner; mono input → derived landed updates in place); **inline-edit factory quote** (owner; mono input + pencil affordance → net% / PASS-FAIL flip in place); **role-locked cells** (other role's fields → chip + lock + caption); derived landed / net% / **`<VerdictLamp>`** / pipeline-stage cells; saving/saved/error per cell; hover; selected (multi-select); loading skeleton row; **virtualized** |
| **`<ProductsListFooter>`** (rollups) | custom bar | `/products` bottom | `counts{pursue,quoted,pass,fail}` | live rollups (# Pursue, # quoted, # PASS, # FAIL) mono/`tnum`; **"Build RFQ from Pursue"** CTA (disabled if 0 Pursue); updates on inline edits; loading |
| **`<ComparisonBoard>`** | `Table` virtualized | `/board` | `rows`, `rankBy: 'headroom'\|'net%'`, `mode` | dense ranked table; **sort by headroom / net%** (header toggle); **Kanban toggle** (`?mode=` → `<KanbanBoard>`); row → peek; **empty**; loading; error; sticky header; mono/`tnum` cells; `<VerdictLamp>` per row |
| **`<BoardModeToggle>`** | `Tabs`/segmented | `/board` header | `mode: 'table'\|'kanban'` | table active / kanban active; URL-synced (`?mode=`); disabled while loading |

---

### 3.H — Pipeline (Kanban)

| Component | shadcn base | Where | Props / variants | States |
|---|---|---|---|---|
| **`<KanbanBoard>`** | custom DnD + `ScrollArea` | `/pipeline`, `/board?mode=kanban` | `columns[]` (New→Shortlisted→Costing→Quoted→Decision), `cards`, `canTransition` | default columns w/ counts; **drag-in-progress** (lift + drop targets highlighted); **illegal-drop** (rejected, snap-back + tooltip "Owner advances this stage"); **Realtime incoming move** (card animates to new column + presence toast); **empty column** ("Nothing here yet"); loading; error; column overflow scroll |
| **`<KanbanColumn>`** | custom | inside board | `status`, `cards`, `count` | default; **drop-valid** (emerald outline); **drop-invalid** (rose/greyed); **Decision column** splits Go/Hold/Pass; empty; count badge; loading |
| **`<KanbanCard>`** | `Card` (compact) | columns | `product`, `economics`, `presence` | default; **dragging** (ghost); hover; **mini economics ribbon** + `<VerdictLamp>`; photo/voltage badges; presence dot (someone viewing); **role-locked drag** (grab disabled when transition not allowed for role); loading skeleton |

---

### 3.I — Dashboard

| Component | shadcn base | Where | Props / variants | States |
|---|---|---|---|---|
| **`<KpiCards>`** | `Card` grid | `/dashboard` | `kpis[]` (# Pursue, # quoted, # PASS, avg headroom, photo to-dos, 220 V flags) | populated (mono/`tnum`); **loading** (skeleton cards); **empty/zero** (graceful "—", not `$0`); trend/delta micro-indicator; **drill-in** hover (links to filtered view); error |
| **`<SelectionsTable>`** | `Table` virtualized | `/dashboard` | `selections[]`, `multiSelect`, `onBuildRfq` | default; **multi-select** (checkbox column + "N selected" bar); **Build Factory RFQ** action (disabled if 0 or missing target-landed); **inline Enter-quote** (owner; mono input → live PASS/FAIL); sort; empty; loading; error; role-locked cells per the transparency model |
| **`<InlineEnterQuote>`** | inline `Input` + `Button` | dashboard, selections, products list | `productId`, `canEdit` (owner) | empty ("Enter quote"); **typing** (mono DDP); **saving** (optimistic); **saved** (PASS/FAIL flips live everywhere); **partner role-locked** (chip + lock + caption); error; validation (> 0) |
| **`<BuildRfqBar>`** | sticky action bar | dashboard / products multi-select | `selectedIds`, `onBuild` | hidden (0 selected); **N-selected** active; **Build Factory RFQ** → opens `<RfqBuilderDrawer>`; disabled if any selected lack target landed; loading |

---

### 3.J — Exports & Import (with full api/* failure → UI mapping)

| Component | shadcn base | Where | Props / variants | States |
|---|---|---|---|---|
| **`<RfqBuilderDrawer>`** | `Sheet`/`Drawer` + `Table` | `/exports`, dashboard "Build RFQ" | `productIds`, `columns`, `editableMoqAsk` | **preview** (columns: name / model / specs / image / target-landed-DDP / MOQ-ask / target-sell / competitor-ref-prices / notes); **editable MOQ-ask** per row; **column validation** (warns missing target landed); **image-exclusion notice** (`export_ok=false` Chinese-text/overlay/wrong-product skipped, count shown); **snapshot note** ("calc_inputs frozen at export"); **structural guard** (prints target landed — never net 16 % / bare 65 %); **generating** (Excel + PDF progress); **done** (download links); empty selection; **`api/rfq` / `api/export` error** (see error table); loading |
| **`<QuoteImportDropzone>`** | custom dropzone + `Table` | `/exports` | `onFile`, `mapping` | idle ("Drop quote CSV"); **drag-over** (highlight); **parsing**; **map-by-external_ref preview** (matched / **unmatched** rows split); **import report** (N matched, M unmatched) before commit; **committing** (upsert factory_quotes); **done** (live margin / PASS-FAIL recompute app-wide + toast); **`api/import/quotes` error** (malformed/partial — see error table); empty |
| **`<ExportPanel>`** (general) | `Card` + `Button` | `/exports` | `view`, `columns`, `format: 'csv'\|'xlsx'` | default (filtered CSV/Excel of any view, same URL params); column picker; **generating**; **done** (download); empty ("nothing to export"); **`api/export` error** (see error table) |
| **`<BulkImportEntry>`** | `Button`/link | `/exports`, `/import` | — | entry to importer; owner-only (hidden/locked for partner); loading |
| **`<Importer>` / `<ImportDryRunDiff>`** | `Table` + `Tabs` | `/import` (owner-only) | `source: 'products'\|'quotes'\|'greenway'`, `dryRun` | **upload/select source**; **dry-run diff** (adds / updates / unchanged / conflicts by `external_ref`); **per-row diff** (old→new); **data-cleaning flags surfaced** (220 V, Chinese-text images, wrong-product gate); **commit** (idempotent upsert + image-upload progress); **done** (summary); **`api/import/products` & `api/import/greenway` error** (see error table); **partner blocked** (route-guarded); loading |

**`api/*` failure → user-facing UI state matrix** (every route maps to a concrete state — no silent failures):

| Route | Failure mode | UI state |
|---|---|---|
| `api/rfq`, `api/export` | exceljs / PDF generation throws | drawer stays open, rose inline "Couldn't build the file — retry"; partial download suppressed |
| `api/rfq`, `api/export` | timeout | "Still working… (large selection)" → on hard timeout, retry CTA |
| `api/import/quotes` | malformed CSV / parse fail | dropzone rose "Couldn't read this CSV" + row/column hint; no commit |
| `api/import/quotes` | partial match | non-blocking report "N matched, M unmatched" + downloadable unmatched list before commit |
| `api/import/products`, `api/import/greenway` | conflict / validation | dry-run diff flags conflicting rows (rose); commit disabled until resolved |
| `api/enrich/keepa` | 429 / quota | amber "Keepa rate-limited — token note" on `<ReRunDiscoveryControl>`; retry-after hint |
| `api/enrich/keepa` | partial enrich | `<CompetitorCard>` shows stale/missing fields with "Enrichment incomplete — retry" chip; `enriched_at` reflects last good |
| `api/ai/discover` | `web_search` tool-error / no results | `<CompetitorEmptyState>` "Discovery found nothing — adjust search profile" + link to `<SearchProfilePanel>` |
| `api/ai/verify` | judge timeout / error | candidates held in tray as "Verification failed — re-run"; never auto-promoted to UI |
| `api/ai/cleanup` | low-confidence / error | `<AiCleanupChip>` "needs review" (amber); original preserved, revert available |
| `api/ai/vision-qa` | error / pending | `<VisionQaBadge>` "pending"; on error, manual-override affordance, no auto-quarantine |
| `api/ai/taxonomy` | error | normalization skipped, raw value shown + "uncategorized" flag; non-blocking |

---

### 3.K — Competitor mini-pages & AI surfaces

| Component | shadcn base | Where | Props / variants | States |
|---|---|---|---|---|
| **`<CompetitorCard>`** (mini-page) | `Card` | PDP competitor section, board detail | `competitor`, `status`, `canEdit` (owner) | **default** (image, title, **Amazon marketplace badge + ASIN** mono, price, ★ rating(reviews), **est monthly sales**, **BSR**, outbound link); **candidate** (amber "needs review" — gated pre-approval); **approved**; **rejected** (dimmed/hidden); **monthly-sales source variants** (real `keepa:monthlySold` vs `keepa:bsr-estimate` fallback label); **`enriched_at` freshness** chip; **owner edit/remove** (pencil); **partner role-locked** (read-only); studio-photo-pending fallback image; loading skeleton; error; **NO price-range bar** (explicitly removed) |
| **`<CompetitorEmptyState>`** | custom | PDP competitor section | `productLine`, `canRunDiscovery` | **empty** (appliances/beauty start with none → "No competitors yet"); **owner CTA** "Run discovery" (Keepa/Claude); **foodservice** variant ("B2B — Amazon competitors N/A"); **discovery running** (progress); error / no-results (→ adjust search profile) |
| **`<CompetitorGrid>` / row** | grid / `ScrollArea` | PDP | `competitors[]` | populated row of mini-cards; horizontal scroll; **mixed statuses** (approved shown, candidates in review tray); empty → `<CompetitorEmptyState>`; loading |
| **`<CandidateReviewTray>`** (AI) | `Sheet`/inline panel | PDP, board | `candidates[]`, `onApprove`, `onReject` | **list of unverified candidates** (post-Haiku-judge, with `match_confidence` + `match_reason`); **needs-review** (borderline confidence, amber); **approve** (→ approved, moves to grid); **reject** → `<RejectWithReasonDialog>`; **empty** ("All candidates reviewed"); **loading** (verification running); error; per-candidate vision / identical-item flag chips; **cross-links to `<SearchProfilePanel>`** to tune the recipe |
| **`<RejectWithReasonDialog>`** (AI) | `Dialog` + `RadioGroup`/`Textarea` | candidate review | `competitor`, `reasonCodes[]`, `onSubmit` | open; **reason-code select** (accessory / bundle / wrong-size / different-use…) + free text; **submitting** (writes competitor_feedback → appends exclude_terms → version++); **submitted** ("Will improve next search"); cancel; error |
| **`<ReRunDiscoveryControl>`** (AI) | `Button` + `Tooltip` | PDP, candidate tray, board | `productId`, `searchProfileVersion` | idle ("Re-run discovery"); **running** (spinner, "Building query → finding ASINs → verifying"); **profile-version** shown (learns from rejections); **done** (new candidates in tray); **rate-limited** (Keepa token note, amber); error (web_search tool-error → empty-state guidance) |
| **`<SearchProfilePanel>`** (AI) | `Card`/`Accordion` (in **PDP advanced drawer**) | PDP advanced surface, settings | `profile` (query, include/exclude terms, category_hint, version) | default (versioned recipe shown); **editable include/exclude terms**; **category hint** (from Keepa `search_for_categories`); **version history**; **empty** (no profile → "Generate"); generating; error; read-only for partner where applicable. **This is the canonical search-profile editor surface, opened from the `<CandidateReviewTray>` reject/learn flow** |
| **`<AiCleanupChip>` / copy-cleanup** (AI) | `Badge` + `Tooltip` | specs table, feature list, PDP | `field`, `cleaned`, `original` | **"AI-cleaned"** (Chinese-text → US English); hover shows original; **220 V flag** raised by cleanup; **needs-review** (low confidence, amber); accept/revert; applied; loading |
| **`<VisionQaBadge>`** (AI) | `Badge` | gallery, importer, image rows | `verdict` | maps verdict→photoState: `good` (no badge / emerald); `foreign-text` → clean-photo-needed (amber → `export_ok=false`); `wrong-product` → quarantined (rose, blocks export); `lifestyle` → clean-photo-needed (info); **pending** (vision running); manual override; tooltip with reason |

---

### 3.L — Data-quality & status badges (cross-cutting)

| Component | shadcn base | Where | Props / variants | States |
|---|---|---|---|---|
| **`<PhotoStateBadge>`** | `Badge` + glyph | cards, gallery, importer, exports | `state: 'good'\|'clean-photo-needed'\|'reshoot'\|'missing'` (canonical enum) | **good** (none/subtle); **clean-photo-needed** (amber, camera glyph); **reshoot** (amber, stronger); **missing** (camera-slash → `<StudioPhotoPending>`); owner to-do count aggregation; tooltip |
| **`<VoltageBadge>` (220 V)** | `Badge` + glyph | cards, AtAGlanceStrip, specs, importer | `voltageFlag` | none (US-ready/unknown); **220 V** (amber + **bolt** glyph + "needs 110–120 V check — US-sourcing landmine"); never silently presented as US-ready; tooltip |
| **`<ExportOkBadge>`** | `Badge` | gallery, RFQ preview, importer | `exportOk` | export-ok (subtle/none); **excluded** ("Won't appear in factory RFQ" — Chinese-text/overlay/wrong-product); **wrong-product gated** (rose, "blocked until reviewed"); tooltip |
| **`<TierDot>`** | `Badge` dot + glyph | cards, rows, kanban | `tier: 'pursue'\|'maybe'\|'pass'` | pursue / maybe / pass (each with redundant glyph + label, colorblind-safe); unset (neutral); loading |
| **`<CompletenessDots>` (3-dot)** | custom | cards, rows | `target`, `quoted`, `actual` | 0–3 filled dots (Target indigo / Quoted amber / Actual slate present); em-dash semantics (no `$0`); tooltip ("Target set, no quote yet"); loading |
| **`<MarketplaceBadge>`** | `Badge` | competitor cards | `marketplace: 'amazon'\|'walmart'\|'other'` | per-marketplace label + glyph; ASIN shown mono for Amazon; outbound-link affordance |
| **`<MonoValue>` / `<MoneyCell>` / `<PercentCell>`** | `<span>` primitives | everywhere money/%/spec/SKU/ASIN/model appears | `value`, `kind`, `suffix` | formatted (mono + `tnum`); **em-dash guard** (null / sell ≤ 0 → "—", never NaN/`$0`); gross vs net color + suffix rules; semantic color by meaning (indigo Target / amber Quoted / slate Actual / emerald PASS / rose FAIL / violet override); loading shimmer |

---

### 3.M — Auth & primitives

| Component | shadcn base | Where | Props / variants | States |
|---|---|---|---|---|
| **`<MagicLinkForm>`** | `Card` + `Input` + `Button` | `(auth)/login` | `onSubmit` | default (neutral, unbranded, invite-only — **no public signup**); **submitting** (sending link); **sent** ("Check your email"); **error** (not invited / rate-limited); disabled while sending; spam-warning helper (custom-sender note) |
| **`<AuthCallback>` state** | spinner/redirect | `auth/callback` | `code` | exchanging (loading); success (redirect → `/catalog`); **error** (invalid/expired link → back to login with message) |
| **`<EmptyState>`** (generic) | `Card` | any list/section | `title`, `description`, `cta?`, `icon` | reusable empty pattern (catalog / board / pipeline / competitors / activity) — never a blank box; with/without CTA; owner-vs-partner CTA gating |
| **`<SkeletonBlock>` set** | `Skeleton` | every async surface | `shape` | card / row / chip / table / panel skeletons matching final layout (mono cells shimmer) |
| **`<ConfirmDialog>`** | `Dialog` (AlertDialog) | destructive / rippling actions | `title`, `onConfirm` | global-assumption ripple confirm; reject/delete confirm; import-commit confirm; submitting; error |
| **`<Tooltip>` / `<HelpHint>`** | `Tooltip` + `Popover` | terminology safeguards, locks, badges | `content` | gross/net terminology explainer (violet accent); lock-reason tooltips; data-quality reasons; PASS/headroom math; always paired with the colorblind glyph |
| **`<UndoToast>`** | `Sonner` | inline edits (tier, quote, pipeline) | `onUndo` | shown post-edit; **undo** action; expired; chained (multiple edits) |

---

### 3.N — Component testing & verification contract

Each component above ships with a verification surface so the inventory is enforceable, not aspirational. **Test obligations per component:**

| Test layer | Tool | What it pins |
|---|---|---|
| **Visual-state matrix (Storybook stories)** | Storybook + a11y addon | one story per enumerated state for every value-bearing component — explicitly: `<FieldLock>` (all 9 states incl. role-locked signature), `<EconomicsWaterfall>` (full / target-only / quote-entered / sell≤0 guard / foodservice / gross≠net), `<VerdictLamp>` (pass/fail/none), `<DealPanel>` (partner-view / owner-view / preview / foodservice), every badge in §3.L (all enum values) |
| **Unit / guard tests** | Vitest + Testing Library | the `sell > 0` em-dash guard renders "—" (never NaN/`$0`); gross and net never share a color and are always suffixed; `<MonoValue>` formats mono/`tnum`; capability gating drives `<FieldLock>` lock state correctly; photo-state enum mapping (vision verdict → state) |
| **Accessibility** | jest-axe / Storybook a11y | every semantic color carries a redundant glyph + label (colorblind-safe); focus-visible ring is indigo and present on all interactive components; keyboard nav for `<PeekSheet>` (↑/↓/Esc), `<CommandPalette>`, `<ImageGallery>` lightbox |
| **Interaction / DnD** | Playwright (E2E) | Kanban legal vs illegal drops (role-gated snap-back); inline-edit save→PASS/FAIL flip propagation app-wide; quote-import round-trip recompute; RFQ image-exclusion + structural guard (prints target landed, never net 16 % / bare 65 %) |
| **Realtime** | Playwright multi-context | presence dots, pipeline moves, and global-assumption ripple sync between two simulated members (optimistic local + Realtime echo) |
| **api/* error states** | Playwright + mocked routes | each row of the §3.J error matrix renders its mapped UI state (timeout, 429/quota, web_search tool-error, exceljs/PDF failure, malformed/partial CSV, partial enrich) — verified, not assumed |

**Test-data rule:** fixtures must honor the neutral/unbranded law (no literal partner/owner brand names; captions use placeholder `{memberName}`) and must include the real data-quality shapes — a 220 V appliance, a Chinese-text beauty image, the single wrong-product (quarantined) SKU, a Greenway item with an Actual cost, and sparse-spec products — so empty/flag/guard states are exercised against realistic data.

---

## 4. States, empty/error & edge cases

> **Canonical contract.** This section is the single source of truth for *which* state every surface renders and *when*. Other sections own *how* each state looks in pixels/SQL and defer here for the trigger conditions. If any surface's behavior in a non-happy state is unclear elsewhere, this matrix governs.

### 4.0 System-wide conventions (apply to every state below)

- **Mono + tabular-nums** for all money / % / SKU / model / ASIN / `external_ref`. Columns stay aligned even when cells render `—`.
- **Missing value = em-dash `—`**, never `$0` / `NaN` / a broken-image glyph. Guard `sell > 0` before any derived economics render.
- **Semantic color is meaning-only and always carries a redundant glyph + label (colorblind-safe).** Pinned values:

  | Token | Color | Glyph | Meaning (only) |
  |---|---|---|---|
  | Target | **indigo** | ◆ | target sell / target landed; **indigo is also the focus-ring — reserved, never reused for Partner** |
  | Quoted | **amber** | file-text ▤ | factory-quote column / value |
  | Owner-edit affordance | **amber** | **pencil ✎ on neutral** | an editable-by-Owner control (prefer pencil so amber *fills* mean Quoted only) |
  | Needs-photo | **amber** | **camera ⚑** | photo-state flag |
  | Owner role | **amber** | **filled dot ●** | role badge / authorship accent |
  | Actual | **slate** | ▣ | real landed cost (Greenway only today) |
  | PASS / Go | **emerald** | ✓ | quote/actual ≤ target |
  | FAIL / Over | **rose** | ✕ | over target / negative net / save failure |
  | Partner / market / per-product override / terminology | **violet** | ⬡ **hollow ring** | the *only* Partner accent — never "indigo/violet" |

  **Amber-overload rule (mandatory):** amber carries four meanings (Quoted, owner-edit, needs-photo, Owner-dot). No two amber meanings may sit adjacent without their **distinct glyph + label**. Amber *fills* are reserved for the **Quoted** column; owner-edit affordances use a **pencil on neutral**, not an amber fill.
- **Neutral / unbranded everywhere.** Never the literal strings "Viral" / "Yuno". Authorship captions are **runtime-injected**: write `set by {memberName} · {relativeTime}`. Lock glyph 🔒 shows when the viewer is the *other* role.
- **Two registers:** **Storefront** (light/roomy: `/login`, `/catalog`, `/p/[slug]`) · **Cockpit** (dense/hairline: `/products`, `/board`, `/pipeline`, `/dashboard`).
- **Catalog scale:** ~**152** products = **70 RoyalStar appliances + 57 beauty + 25 Greenway**. Data-quality baselines: **45/57** beauty images contain Chinese text (**24** flagged `needs_clean_photo`); **46/70** appliances list **220 V**; **1** wrong-product image quarantined. Greenway is the **only** line with a real Actual cost.

---

### 4.1 Per-surface state matrix

Every table below covers the seven canonical state columns: **Default · Loading/skeleton · Empty/first-run · Partial/sparse · Error · Role-locked · Edge/special.**

#### A1. Auth — `(auth)/login`, `auth/callback`
| State | Render |
|---|---|
| Default | Neutral centered card; email + "Send magic link"; copy "Private workspace — invite only." **No public-signup affordance, ever.** |
| Loading | Button → spinner "Sending…", input disabled. Callback route: full-screen "Signing you in…" neutral spinner. |
| Empty/first-run | Same card; helper "Enter the email you were invited with." |
| Partial/sparse | Pre-filled email on a known/returning device. (No list data.) |
| Error | Typo → inline field error. Non-invited email → generic "If your email is on the invite list, a link is on its way." (no account-enumeration leak). Expired/used link → callback "This link expired or was already used — request a new one" + resend. Rate-limited → "Too many requests, try again in {relativeTime}." |
| Role-locked | n/a (pre-auth). |
| Edge/special | Already authenticated → redirect `/` → `/catalog`. Link opened on a different device/browser → "Open this link in the browser where you requested it." Clock-skew / PKCE mismatch → re-initiate. **Deep-link target (e.g. `/p/[slug]`) preserved through auth and restored post-login.** |

#### A2. App shell — top bar · ⌘K palette · role badge
| State | Render |
|---|---|
| Default | Workspace name (neutral), nav, role badge (**amber filled-dot ● Owner** / **violet ⬡ Partner**), presence avatars, ⌘K hint. |
| Loading | Bar renders instantly from session; presence avatars skeleton dots; ⌘K index lazy-loads ("Indexing…" until ready). |
| Empty/first-run | Presence shows only self ("Just you here"). ⌘K recent-items empty → static nav + "Type to search 152 products." |
| Partial/sparse | Partner online but realtime not yet subscribed → self-only presence + subtle "connecting" tick. |
| Error | ⌘K backend error → "Search unavailable — use the catalog filters." Nav still works. |
| Role-locked | Owner-only nav (`/settings/members`, `/import`) **hidden** for Partner (not shown-disabled). Partner sees full read nav. |
| Edge/special | Owner **"Preview as Partner"** → client-only banner "Viewing as Partner (preview) — Exit"; all edit affordances lock; **no writes possible** in preview. ⌘K natural-language search is **Phase-3** → keyword/route nav only now. |

#### A3. Catalog grid — `/catalog` (Storefront)
| State | Render |
|---|---|
| Default | Image-forward cards: photo (object-contain on neutral tile), name + mono model chip, line badge, tier chip if set, has-quote ▤ / PASS ✓ pill. Faceted filter rail; **all filter state in URL**; grid↔table toggle. |
| Loading | Card-grid skeleton (image block + 2 text lines); filter counts as shimmer pills. |
| Empty/first-run | Pre-import: "No products yet — run an import to load the catalog" (Owner) / "Catalog is being set up" (Partner). Post-filter zero-results → "No products match these filters" + **Clear filters** + echo of active facets. |
| Partial/sparse | No primary image → branded **"Studio photo pending"** placeholder (never broken-image). Missing tier/quote pills simply absent (not `—` badges). |
| Error | Query/RLS/network failure → inline "Couldn't load the catalog" + **Retry**; **filters preserved in URL**. Some Storage images 404 → per-card placeholder, rest render. |
| Role-locked | Browse is read-only for both. Quick-tier on card hover is **Partner-writable**; Owner sees it read-only with 🔒. |
| Edge/special | ~152 results virtualized/paginated. `external_ref` collisions across lines resolve to **one** card. `?mode=` + facet state shareable as a saved-view URL. Photo-state **⚑** chip on card corner (`good`/`clean-photo-needed`/`reshoot`). |

#### A4. Catalog table — `/catalog` table view (Storefront → denser)
| State | Render |
|---|---|
| Default | Columns: thumb · name · model (mono) · line · tier · target sell (mono $) · target landed ◆ · quoted ▤ · net% · PASS/FAIL · photo-state. Sortable; URL-driven. |
| Loading | Header solid; ~12 shimmer body rows with column-width skeletons. |
| Empty/first-run | "No products to list yet." Filtered-empty → same **Clear filters** affordance as grid. |
| Partial/sparse | No target → sell/landed cells `—` (indigo-muted). No quote → quoted `—` (amber-muted, hover "Awaiting quote"), **never $0**. No actual → slate `—`. |
| Error | Row-level enrich error tolerated (cell `—` + ⚠ tooltip); table-level load error → full error row + Retry. |
| Role-locked | Cells render but are **non-editable here** (editing lives on `/products`). Both roles read all columns. |
| Edge/special | Mixed-line sort: Greenway rows show Actual ▣ lit; appliance/beauty rows show Actual `—`. Tabular-nums keep money columns aligned despite `—`. |

#### A5. PDP — `/p/[slug]` (full) + `(.)p/[slug]` peek Sheet
| State | Render |
|---|---|
| Default | Storefront server shell: left image gallery (lightbox + photo-state chip), at-a-glance spec chips, features, full spec table, competitor mini-pages, activity/comments; right **docked Deal Panel** (economics island, client). |
| Loading | Server shell streams instantly (name, specs, images); Deal Panel island hydrates with a compact skeleton (3-column waterfall placeholder + lamp shimmer); competitor strip lazy-loads card skeletons. |
| Empty/first-run | No competitors → "No competitors yet" + (Owner) **Find competitors** / **Add manually**; (Partner) passive note. No selection → Targets block shows empty calculator inviting target sell. No comments → "No notes yet." |
| Partial/sparse | Sparse specs (**4 beauty no specs / 8 no model / 2 appliances no features**) → omit the empty section with a thin "No specs on file" line, never blank scaffolding. Missing model chip **hidden**, not `—`. |
| Error | Slug not found → 404 boundary "Product not found" + back-to-catalog. **Deal Panel island error isolates** → "Economics unavailable — Retry" while the rest of the PDP stays usable. |
| Role-locked | Owner-editable: specs · images · competitors · factory quote · advance Costing→Quoted (Partner sees 🔒 + caption). Partner-editable: tier · target sell · target landed · overrides · notes · New↔Shortlisted (Owner sees 🔒). Both read everything. |
| Edge/special | Peek Sheet: ↑/↓ prev/next within the **current filtered set**, Esc closes, URL is the intercepted route; deep-load/refresh of `(.)p/[slug]` falls through to full `/p/[slug]`. `external_ref` resolves slug across lines. **220 V appliances show a "Verify for US" annotation inline at the voltage spec** — never silently US-ready. **Search-profile editor opens from a PDP advanced drawer (A19), cross-linked from the candidate-review queue (A18).** |

#### A6. Deal Panel / Economics waterfall — `<EconomicsWaterfall>`
| State | Render |
|---|---|
| Default | 3 columns **Target ◆ / Quoted ▤ / Actual ▣**; rows: sell → −opex(49%) → landed → net/unit (landed + net each with %). Live column (Quoted else Actual else Target) gets **accent ring**. PASS lamp: **emerald ✓ PASS / rose ✕ FAIL / headroom $**. Labeled blocks **"Targets"** (market) + **"Factory quote"** (cost). |
| Loading | Column scaffold with row labels; numbers as shimmer bars; lamp grey "Calculating…". |
| Empty/first-run | No target sell → all numeric cells `—`; lamp neutral "Set a target sell to begin." |
| Partial/sparse | Target set, no quote, no actual → Target column lit + ringed; Quoted "— Awaiting quote"; Actual `—`. **Greenway: Actual ▣ lit + ringed** (only line with real Actual). |
| Error | Calc input corrupt/over-range → row `—` + ⚠ "Check assumptions"; **lamp suppressed (never a false PASS)**. |
| Role-locked | Targets block: Partner edits, Owner 🔒. Factory-quote block: Owner edits, Partner 🔒. Each value carries `set by {memberName} · {relativeTime}`. |
| Edge/special | `sell=0`/blank → `—` not NaN/$0 (guard `sell>0`). Negative headroom → "Over by $X" rose ✕. Negative net → net% rose + **OVER/FAIL**. Quote ≤ target → emerald ✓ PASS + "$X headroom". **Gross (≤35% COGS) and Net (≈16%) never adjacent, never same color, always %-suffixed** — opex(49%) sits as its own row so net is visibly separate (terminology safeguard). |

#### A7. Calculator — global (`/settings/assumptions`) + per-product override
| State | Render |
|---|---|
| Default | `<CostStackEditor>`: cost-stack lines (referral 15 / ads 15 / FBA 15 / returns 4 = **49% opex**) + **0% partner-split line** + target gross 65% → landed ≤ 35%. Live recompute every keystroke/slider. |
| Loading | Sliders + inputs render from cached assumptions instantly; recompute-preview area shimmer until island hydrates. |
| Empty/first-run | Global single-row **seeded with defaults** (never truly empty). Per-product: no override → shows global values, **no violet chip**. |
| Partial/sparse | Per-product override partially set → **violet ⬡ "Overriding global" chip** + per-field reset; un-overridden fields inherit global (greyed-inherited styling). |
| Error | Line items not summing / >100% → inline "Cost stack exceeds 100%"; **save blocked**; live preview shows `—`. |
| Role-locked | Global assumptions **Owner-only edit**; Partner read-only 🔒 + "Global assumptions set by {memberName}". Per-product override: Partner edits (their selection); Owner 🔒. |
| Edge/special | Global change → **Realtime ripple** (optimistic local recompute + sync); warning if it affects SKUs with already-sent RFQs (see G/A14). Reset-to-global clears the violet chip. Partner-split line reserved at 0%. Net≈16% label kept separate from 65% gross. |

#### A8. Products editable list — `/products` (Cockpit)
| State | Render |
|---|---|
| Default | Dense virtualized rows; inline-edit **tier · target sell · factory quote** per row without opening pages. Hairline dividers, mono money. |
| Loading | Header solid; virtualized skeleton rows; inline-edit controls disabled until hydrated. |
| Empty/first-run | Pre-import → "No products yet." Products-no-selections → tier/target cells empty-editable (placeholder "Set tier" / "$ target"). |
| Partial/sparse | Mixed: some rows quoted (▤ lit + PASS/FAIL pill), most appliances "Awaiting quote"; Greenway Actual ▣. |
| Error | Per-cell save error → cell reverts + rose toast "Couldn't save {field}"; optimistic value rolled back. List load error → full Retry. |
| Role-locked | Partner edits tier/target-sell; **factory-quote cell 🔒 for Partner**. Owner edits factory-quote; **tier/target-sell 🔒 for Owner**. Mismatched edit attempt → lock glyph + tooltip "Editable by {role}". |
| Edge/special | Inline edit triggers **live recompute** of that row's net%/PASS app-wide (optimistic→synced). Bulk paste into target-sell column supported; invalid cells flagged inline. |

#### A9. Board — `/board` (Cockpit comparison + Kanban `?mode=`)
| State | Render |
|---|---|
| Default | Dense comparison table ranked by headroom / net%; landed cols + PASS lamp; Kanban toggle via `?mode=`. |
| Loading | Virtualized skeleton rows; sort header solid; rank column shimmer. |
| Empty/first-run | No selections/quotes → "Nothing to compare yet — set targets and tiers first." |
| Partial/sparse | Items lacking quote sink to bottom / group "Awaiting quote"; PASS/FAIL only on quoted rows; Greenway PASS on Actual. |
| Error | Sort/compute error → "Couldn't rank — Retry"; raw rows still listed unsorted. |
| Role-locked | Read/triage for both; tier/target inline (Partner) and quote (Owner) follow A8 lock rules; Kanban drag follows A10. |
| Edge/special | Rows with `—` (no quote) **sort last consistently**. Toggle persists in URL (shareable). Negative-net rows flagged rose at top of the "problem" sort. |

#### A10. Pipeline — `/pipeline` (shared Kanban, Realtime)
| State | Render |
|---|---|
| Default | Cards in 5 columns **New → Shortlisted → Costing → Quoted → Decision**; Realtime moves; Decision sub-state (Go ✓ / Hold / Pass). |
| Loading | Column headers solid; 2–3 skeleton cards per column. |
| Empty/first-run | All seeded **New** on import → New full, others "Drop cards here." |
| Partial/sparse | Costing/Quoted populate only as quotes arrive; empty columns show dashed drop-zone hint. |
| Error | Move save fails → card **snaps back** + rose toast "Move didn't stick — try again." Realtime drop → cards still movable, sync on reconnect. |
| Role-locked | **Owner** advances Costing→Quoted; **Partner** moves New↔Shortlisted; **either** moves to Decision. Disallowed drag → drop rejected + tooltip "Only {role} can advance to {stage}." |
| Edge/special | Concurrent moves → **last-write-wins** on `pipeline_status` (single row/product) + toast "{memberName} moved this to {stage}." Presence cursors/avatars on columns during co-editing. |

#### A11. Dashboard — `/dashboard` (Owner cockpit, visible to both)
| State | Render |
|---|---|
| Default | KPI cards (# Pursue, # quoted, # PASS/FAIL, avg headroom); selections table; multi-select → **Build Factory RFQ**; inline Enter-quote. |
| Loading | KPI cards as 4 shimmer tiles; selections-table skeleton rows. |
| Empty/first-run | No selections → KPIs show 0 with muted "—%"; table "No selections yet — partner hasn't tiered anything." RFQ button disabled "Select rows to build an RFQ." |
| Partial/sparse | Sparse quotes → low "# quoted", small PASS/FAIL counts; appliances dominate "Awaiting quote." |
| Error | KPI compute error → tile `—` + ⚠; table errors independently + Retry. |
| Role-locked | Inline Enter-quote **Owner-only**; Partner sees quote cells 🔒. Multi-select→RFQ available to both (export is shared); quote entry gated. |
| Edge/special | Multi-select preserved across pagination; "Build RFQ" with rows lacking eligible images warns (see E/A12). KPIs recompute live on quote import / assumption ripple. |

#### A12. Exports / RFQ builder — `/exports`
| State | Render |
|---|---|
| Default | Previewable RFQ builder **drawer**: columns name/model/specs/image/target-landed-DDP/MOQ-ask/target-sell/competitor-ref-prices/notes. Filtered CSV/Excel; Excel image-embedded (exceljs) + PDF. Quote-import dropzone + bulk-import entry. |
| Loading | Drawer opens with preview-table skeleton; "Generating Excel/PDF…" progress on export. |
| Empty/first-run | No eligible rows → "No eligible products — set target landed and tier first." Export buttons disabled. |
| Partial/sparse | Rows missing target landed → "Set target before exporting" (excluded/warned). Missing competitor ref prices → that column `—`. |
| Error | exceljs/PDF generation failure → "Export failed — Retry"; **partial download prevented**. File too large → chunk/warn. |
| Role-locked | Export shared (both build RFQs). Quote-import **commit Owner-only** (writes `factory_quotes`); Partner previews but 🔒 on Commit. |
| Edge/special | **Snapshots `calc_inputs` at export** (later assumption changes don't rewrite a sent RFQ; label "as of {relativeTime}"). **Excludes images flagged Chinese-text / text-overlay / wrong-product**; if a row's only image is quarantined → row exports with **"Studio photo pending"** placeholder + ⚑ note, image cell blank — **never the bad image**. |

#### A13. Quote import — CSV round-trip
| State | Render |
|---|---|
| Default | CSV dropzone → map by `external_ref` → preview matched/unmatched → commit → `factory_quotes`; margins/PASS-FAIL recompute live app-wide. |
| Loading | "Parsing CSV…" → "Matching {n} rows…" progress; preview-table skeleton. |
| Empty/first-run | Empty/zero-row CSV → "No rows found in file." |
| Partial/sparse | Partial match → split **Matched (n) / Unmatched (m)** with per-row reason; commit applies matched only; unmatched downloadable. |
| Error | Malformed CSV → "Couldn't read this file — expected columns: external_ref, landed_cost_ddp, moq, lead_time_days, supplier." Wrong delimiter detected → suggest fix. |
| Role-locked | Commit **Owner-only**; Partner preview-only with 🔒 Commit. |
| Edge/special | Duplicate `external_ref` in file → "Using last row for {ref}" warning. On commit, PASS/FAIL flips live on PDP / `/products` / `/board` / `/dashboard`. **Re-import same file idempotent** (updates, not dupes). |

#### A14. Settings / assumptions — `/settings/assumptions`
| State | Render |
|---|---|
| Default | Global cost-stack + target-margin editor `<CostStackEditor>`; live preview; "last changed by {memberName} · {relativeTime}". |
| Loading | Sliders from cached values instant; preview shimmer. |
| Empty/first-run | Seeded defaults; "These are global defaults — products can override individually." |
| Partial/sparse | Per-LINE assumption profiles listed with inherit/override indicators. |
| Error | Sum>100% / negative → blocked save + inline validation; **Realtime ripple deferred until valid.** |
| Role-locked | **Owner-only edit**; Partner read-only 🔒 full panel. |
| Edge/special | Save → **change-global warning dialog** if SKUs have already-sent RFQs ("This affects {n} products in sent RFQs — those exports keep their snapshot; future calcs change"). Confirm → optimistic ripple + Realtime sync. |

#### A15. Settings / members — `/settings/members` (Owner-only)
| State | Render |
|---|---|
| Default | Member rows (email, role badge, status active/invited), invite form, role select. |
| Loading | Member-row skeletons; invite form enabled. |
| Empty/first-run | Only Owner + Partner seeded; "Invite a new member" CTA. |
| Partial/sparse | Pending invite → "Invited · awaiting first login {relativeTime}". |
| Error | Invite send fail → "Couldn't send invite — Retry." Duplicate email → "Already a member / invited." |
| Role-locked | **Entire route Owner-only**; Partner here → 403 boundary "Members is managed by the owner." |
| Edge/special | **Cannot revoke/demote the sole Owner** (guard). Role change of an active member → confirm dialog re: capability impact. |

#### A16. Import / dry-run — `/import` (Owner-only, idempotent)
| State | Render |
|---|---|
| Default | Source pickers (appliances JSON / beauty JSON / Greenway) → **dry-run diff** (create / update / unchanged / conflict) → Commit. |
| Loading | "Reading sources…" → "Computing diff…" progress; diff-table skeleton. |
| Empty/first-run | No source selected → "Choose a source to preview changes." |
| Partial/sparse | Diff mostly unchanged + few updates; **data-quality flags surfaced**: 220 V count, Chinese-text image count, `needs_clean_photo` count, wrong-product quarantine. |
| Error | Source parse error / bad path → "Couldn't read {source}" with path; commit blocked. |
| Role-locked | **Owner-only**; Partner → 403 boundary. |
| Edge/special | **Zero-changes** → "Everything is already up to date — nothing to commit." **With-conflicts** → conflict rows highlighted (in-app edit vs source) with per-row **keep-app / take-source**; commit only after resolution. Idempotent via `external_ref`. |

#### A17. Competitor mini-pages — per product
| State | Render |
|---|---|
| Default | Card: image, title, marketplace badge (amazon/walmart/other), ASIN (mono), price (mono), ★rating(reviews), est monthly sales, BSR, outbound link. **No min/median/max price-range bar** (removed). |
| Loading | 2–4 card skeletons (image block + 3 text lines). |
| Empty/first-run | "No competitors yet" + (Owner) **Find competitors** / **Add manually**; appliances/beauty start with none. |
| Partial/sparse | Keepa enrich incomplete → missing cells `—` (BSR/monthlySold often null) + tooltip "Not provided by Keepa"; price/rating shown if present. |
| Error | Outbound link dead / enrich failed → card kept with ⚠ "Couldn't refresh — Re-enrich"; image 404 → placeholder. |
| Role-locked | **Owner manages** competitors (add/approve/reject/delete); Partner read-only + may submit "not a fit" feedback (feeds learning loop) but **not delete**. |
| Edge/special | Card carries **status** (candidate/approved/rejected) + match_confidence + match_reason + source (claude/manual/keepa). Candidate cards **visually distinct (dashed)** and excluded from "approved" counts until cleared. |

#### A18. AI candidate review — discovery results queue
| State | Render |
|---|---|
| Default | Candidate list with verdict pill (needs-review / approved / rejected), confidence %, match_reason, flags[] (accessory/bundle/wrong_capacity), source, **Approve / Reject-with-reason**. |
| Loading | "Discovering competitors…" → "Verifying {n} candidates…" staged progress; candidate-row skeletons. |
| Empty/first-run | **No candidates** → "No competitors found for these specs — Add manually or broaden the search profile." |
| Partial/sparse | Mixed: some approved by Haiku judge, some needs-review (**borderline never auto-approved**), some auto-rejected (accessory/wrong-size) shown collapsed. |
| Error | Keepa **429/quota** → "Keepa is over quota — results will refresh shortly / Retry later." `web_search_tool_result` carries error object → handled **before reading** → "Identical-item search unavailable this run" (primary Keepa results still shown). Discovery exception → "Discovery failed — Re-run." |
| Role-locked | **Owner-only** approve/reject + re-run; Partner read-only + may flag "not a fit" (reason captured). |
| Edge/special | Reject-with-reason appends `exclude_terms` → `search_profile` version++ → next re-run smarter. Vision-QA verdict may attach image flags. monthlySold null → BSR-derived volume signal shown. **Cross-links to the Search-profile editor (A19).** |

#### A19. Search-profile editor — versioned per-product Keepa Finder recipe (PDP advanced drawer)
| State | Render |
|---|---|
| Default | Fields: query text, include_terms[], exclude_terms[], category_hint (resolved node), version, "updated by {memberName} · {relativeTime}". Opens from a **PDP advanced drawer**, cross-linked from A18. |
| Loading | Form from cached profile; "Resolving category…" if node not cached. |
| Empty/first-run | No profile → **"Generate from specs"** (Claude builds initial query) → seeds v1. |
| Partial/sparse | Category unresolved (search_for_categories returned options, none picked) → **"Pick a category node"** selector from **real options only** (never invented). |
| Error | Category resolve fail / Claude error → "Couldn't build query — edit manually or retry." Invalid price band → inline validation. |
| Role-locked | **Owner-only edit**; Partner read-only 🔒 (can see *why* a competitor set looks as it does). |
| Edge/special | Each reject feedback bumps version & appends exclude_terms (audit-visible diff vN→vN+1). Re-run uses latest version; old versions **retained for provenance**. |

---

### 4.2 (B) Cross-cutting system states
| Condition | Render / Behavior |
|---|---|
| **Offline / Realtime-degraded** | Persistent top-bar **amber pill** "Offline — changes will sync when reconnected." Reads from last cache; writes queued/optimistic where safe, else disabled with tooltip. Presence collapses to self. On reconnect: "Back online — syncing" then silent reconcile. |
| **Session / magic-link expired** | Mid-session token expiry → non-destructive modal "Your session expired — sign in to continue" (preserves unsaved field as draft where possible) → re-auth returns to the same route. Expired link at callback → "Link expired or already used — request a new one." |
| **Optimistic-save → synced** | Field shows value immediately + subtle "Saving…" tick → resolves to "Saved" / `set by {memberName} · just now`. On failure → revert + rose toast "Couldn't save — your change was undone." |
| **Last-write-wins conflict** (shared single-row fields: `selections.target_sell_price`, `pipeline_status`) | LWW. If the other partner wrote while you edited → on save, inline notice "{memberName} changed this {relativeTime} ago — yours overwrote it" + **Undo to theirs**. Realtime pushes their value into your *idle* field with a brief highlight. |
| **Permission-denied (RLS reject vs UI-lock mismatch)** | UI is the source of *affordance* (🔒 hides/disables); **RLS is the source of truth.** If a write slips past UI and RLS rejects → rose toast "You don't have permission to edit {field} (editable by {role})" + revert; logged. UI lock + RLS kept in lockstep by the capability map — any drift is a bug, surfaced in dev as an assertion failure. |
| **404** | Route/slug not found → neutral "We couldn't find that" + back-to-catalog; shell preserved. |
| **403** | Owner-only route by Partner → "This area is managed by the owner" + return link (no raw stack). |
| **500 / error boundary** | Per-segment boundary "Something went wrong here — Retry" keeps shell + nav alive; **islands (Deal Panel, competitor strip) isolate** so one failure doesn't blank the PDP. |
| **Maintenance** | Full-screen neutral "The Portal is briefly down for maintenance — back shortly" (no branding); auth bypassed to this screen. |

---

### 4.3 (C) Data-quality state rules
**Canonical photo-state enum (one enum, used by `PhotoStateBadge` / `StudioPhotoPending` / `ImageGallery` / `VisionQaBadge`):** `good | clean-photo-needed | reshoot | missing`.

| Vision-QA verdict | → photo-state | Export behavior | UI chip |
|---|---|---|---|
| good | `good` | included in RFQ export | (no chip / subtle ✓) |
| foreign-text (Chinese) | `clean-photo-needed` | **excluded** | camera ⚑ "Clean photo needed" (amber) |
| lifestyle | `clean-photo-needed` | **excluded** | camera ⚑ "Clean photo needed" (amber) |
| wrong-product | **quarantined + `reshoot`** | **hard-blocked** | ⚠ "Reshoot — wrong product" (rose) |
| (no image on file) | `missing` | row exports w/ **"Studio photo pending"** placeholder | branded placeholder, **never broken-image icon** |

- **Chinese-text tag:** **45/57** beauty images flagged; **24** flagged `needs_clean_photo` → surfaced as an **Owner to-do count**. Tagged images render fine in-app but are export-excluded.
- **220 V "Verify for US":** **46/70** appliances list 220 V → `voltage_flag`; annotated inline at the voltage spec **and** on the RFQ ("Verify voltage for US"), **never silently US-ready**.
- **1 wrong-product image:** quarantined, blocked from all exports; product still usable, image cell shows placeholder + reshoot flag.
- **Sparse data:** 4 beauty no specs, 8 no model, 2 appliances no features → omit empty sections gracefully ("No specs on file"); missing model chip **hidden**, not `—`.
- **"Studio photo pending"** is the *only* missing-image state a user ever sees — no broken-image glyph anywhere.

---

### 4.4 (D) Calculator / economics edge states
| Case | Render |
|---|---|
| sell = 0 / blank | All derived cells `—` (guard `sell>0`); lamp neutral "Set a target sell." **Never** NaN / $0. |
| Gross-vs-net adjacency | "65% gross" (COGS≤35%) and "net≈16%" **never adjacent, never same color, always %-suffixed**; opex(49%) kept as its own row so net is visibly separate. |
| Quote absent | Quoted column "— **Awaiting quote**" (amber-muted em-dash), **never $0**; live column falls back to Actual else Target. |
| Negative headroom | "**Over by $X**" rose ✕; lamp FAIL. |
| Negative net | net% rose + **OVER/FAIL** label; row flagged in board "problem" sort. |
| PASS | quoted ≤ target → emerald ✓ **PASS** + "$X headroom". |
| Greenway Actual-lit | Actual ▣ populated + ring (only line with real Actual); PASS/FAIL computed on Actual. |
| Appliance/beauty Actual-empty | Actual ▣ `—`; live column = Quoted if present else Target; **no false Actual**. |
| Override divergence | Per-product override active → violet ⬡ "Overriding global" chip; numbers reflect override; reset restores global. |
| Assumptions invalid (sum>100%) | Affected rows `—` + ⚠ "Check assumptions"; **lamp suppressed** (no false PASS). |

---

### 4.5 (E) Export / import edge states
| Case | Render |
|---|---|
| RFQ — no eligible rows | "No eligible products — set target landed and tier first." Export disabled. |
| RFQ — quarantined/flagged images | Chinese-text / text-overlay / wrong-product **excluded**; affected rows export with "Studio photo pending" + ⚑; image cell blank — **never the bad image**. |
| RFQ — calc_inputs snapshot | On export, `calc_inputs` snapshotted onto the RFQ so later global/per-product changes don't rewrite a sent RFQ; label "as of {relativeTime}". |
| Quote CSV — malformed | "Couldn't read this file — expected: external_ref, landed_cost_ddp, moq, lead_time_days, supplier"; encoding/delimiter hints. Commit blocked. |
| Quote CSV — unmatched ref | Split **Matched (n) / Unmatched (m)**; per-row reason; unmatched downloadable; commit applies matched only. |
| Quote CSV — partial / duplicate ref | Duplicate ref → "Using last row for {ref}" warning; idempotent re-import updates, not dupes. |
| Import dry-run — zero changes | "Everything is already up to date — nothing to commit." |
| Import dry-run — with conflicts | Conflict rows highlighted (in-app edit vs source); per-row keep-app / take-source; commit only after resolution. |

---

### 4.6 (F) AI edge states
| Case | Render |
|---|---|
| Discovery — no candidates | "No competitors found for these specs — Add manually or broaden the search profile." |
| Keepa — 429 / quota | "Keepa is over quota — try again shortly." (pre-batch token check; non-blocking; cached competitors remain.) |
| web_search — tool-error object | `web_search_tool_result` error handled **before reading** → "Identical-item search unavailable this run"; primary Keepa Finder results still surface. |
| Candidate — needs-review | Borderline judge verdict → amber "Needs review" pill, **never auto-approved**; awaits human. |
| Candidate — approved | Haiku judge cleared → emerald ✓ approved; counts toward competitor set. |
| Candidate — rejected | Auto-reject (accessory/bundle/wrong-size) or human reject → collapsed "Rejected" group; reason captured. |
| Claude API error (verify/cleanup/query) | "AI step failed — Re-run"; cached prior result (if any) stays; never blocks the rest of the page. |
| Vision-QA verdict attach | Image flags (foreign-text/wrong-product/lifestyle) map to photo-state (see C) and may down-rank/exclude an image. |

**`api/*` failure → user-facing state map (every route covered):**

| Route | Failure mode | UI state |
|---|---|---|
| `api/rfq` | timeout / build error | "Couldn't build the RFQ — Retry" (drawer stays open, selection preserved) |
| `api/export` | exceljs/PDF generation / file-too-large | "Export failed — Retry"; partial download prevented; large → chunk/warn |
| `api/import/quotes` | malformed CSV / encoding | "Couldn't read this file — expected columns: …"; commit blocked |
| `api/import/products` | source parse / bad path | "Couldn't read {source}" + path; commit blocked |
| `api/import/greenway` | source parse / schema mismatch | "Couldn't read Greenway source" + path; commit blocked |
| `api/enrich/keepa` | 429/quota · partial enrich | quota → "Keepa is over quota — refresh shortly"; partial → missing cells `—` + "Not provided by Keepa" |
| `api/ai/discover` | timeout / exception | "Discovery failed — Re-run"; cached candidates remain |
| `api/ai/verify` | Haiku judge error | "Verification failed — Re-run"; candidates fall back to **needs-review** (never auto-approved) |
| `api/ai/cleanup` | Claude spec/copy error | "AI cleanup failed — Re-run"; original copy preserved |
| `api/ai/vision-qa` | vision call error | "Image QA unavailable — Re-run"; photo-state left unchanged, never silently `good` |
| `api/ai/taxonomy` | normalization error | "Couldn't normalize taxonomy — Retry"; raw line/category retained |

All `api/*` failures are **non-blocking islands**: the failing surface shows its retry state while the rest of the page stays usable.

---

### 4.7 (G) Confirmations / toasts / destructive dialogs
| Action | Dialog / Toast |
|---|---|
| Delete competitor | Confirm "Remove {competitor title}? This can't be undone." → rose-neutral toast "Competitor removed" (Owner-only). |
| Archive product | Confirm "Archive {product}? It leaves the catalog but keeps its data and any sent RFQs." → "Archived · Undo" toast. |
| Re-run discovery | Confirm if it overwrites candidates: "Re-run discovery for {product}? New candidates will be re-verified." → progress toast "Discovering…". |
| Change global assumptions (w/ sent RFQs) | **Warning dialog** "This affects {n} products. Already-sent RFQs keep their snapshot; future calculations change. Continue?" → confirm → optimistic ripple + Realtime sync + toast "Global assumptions updated by {memberName}". |
| Reject-with-reason (candidate) | Reason picker (reason_code + free text) **required** → "Marked not a fit — search profile updated to v{n+1}" toast; feeds exclude_terms. |
| Commit quote import | Confirm "Apply {n} matched quotes? Margins recompute everywhere." → "Quotes imported — {p} PASS / {f} FAIL" toast. |
| Commit import dry-run | Confirm "Apply {creates} new, {updates} updated? {conflicts} conflicts resolved." → "Import complete" toast. |
| Generic save success | Quiet "Saved" / `set by {memberName} · just now`. |
| Generic save failure | Rose toast "Couldn't save {field} — your change was undone" + revert. |
| Permission-denied write | Rose toast "You don't have permission to edit {field} (editable by {role})." |
| Destructive in Preview-as-Partner | All destructive/edit actions disabled with tooltip "Editing is off in Preview mode." |

---

### 4.8 State coverage & QA test checklist

This matrix is testable, not aspirational. Each surface (A1–A19) plus the cross-cutting sets (B–G) must be exercised against the seven canonical states. Minimum coverage gates before a surface is "done":

- **Per-surface snapshot tests** — one rendered snapshot per state column that the surface can reach (Default · Loading · Empty/first-run · Partial · Error · Role-locked · Edge). A surface that omits a column must justify it inline (e.g. A1 Role-locked = n/a pre-auth).
- **Role-lock assertions (capability-map drift guard)** — for every editable field, a test that (1) the *other* role sees 🔒 + caption and no writable control, and (2) a forced write is rejected by RLS with the matching rose toast. UI-lock and RLS asserted in lockstep; any divergence fails the suite (dev assertion).
- **Economics guards** — unit tests for `sell=0`/blank → `—` (never NaN/$0), negative headroom → "Over by $X" rose, sum>100% assumptions → lamp suppressed, gross/net never same color/adjacent. Greenway Actual-lit vs appliance/beauty Actual-empty both covered.
- **Photo-state mapping** — table-driven test of every vision-QA verdict → enum value → export inclusion/exclusion + chip; assert wrong-product is hard-blocked and `missing` always renders the branded placeholder (no broken-image glyph).
- **`api/*` failure injection** — for each route in the §4.6 map, inject timeout / 429 / tool-error / generation-failure / malformed-input and assert the named user-facing state appears while the rest of the page stays interactive (island isolation).
- **Realtime / LWW** — concurrent-write test on `selections.target_sell_price` and `pipeline_status` asserting last-write-wins + "{memberName} changed this …" notice + Undo-to-theirs.
- **Idempotency** — re-import the same products/quotes file twice; assert updates-not-dupes and "Everything is already up to date" on the zero-change dry-run.
- **Count fixtures** — seed fixtures must reflect the canonical baselines (152 = 70+57+25; 45/57 Chinese-text incl. 24 `needs_clean_photo`; 46/70 220 V; 1 wrong-product) so empty/partial/edge states are exercised with realistic sparsity rather than a clean dataset.

A surface is not shippable until its row in §4.1 has a passing test for every reachable state column above.

---

## 5. Design system & tokens

The canonical token + theme spec for **The Portal** — concrete enough to author `tailwind.config.ts`, `globals.css` (CSS custom properties), and the shadcn/ui theme directly. The Portal is a neutral, **unbranded** two-sided sourcing-collaboration app: no product or company wordmark ever appears in chrome. Two visual registers share one token core. All tokens are given as **CSS variables** (HSL channels, shadcn convention) with the **Tailwind alias** and **raw value**.

> **Neutrality is a token-level rule, not just a copy rule.** No literal "Viral", "Yuno", or any mark appears anywhere in the system. Authorship is **runtime-injected** — captions render `set by {memberName} · {relativeTime}` (e.g. "set by {memberName} · 2d ago"), never a hard-coded name. Roles are referenced only as Owner / Partner and only in captions, never in field labels.

---

### 5.0 Token architecture (how it's wired)

- **Layer 1 — primitives**: raw scales (`--slate-50`…`--indigo-900`, radii, spacing). Never referenced directly by components.
- **Layer 2 — semantic aliases**: meaning-bearing tokens (`--target`, `--quoted`, `--actual`, `--pass`, `--fail`, `--partner`, `--needs-photo`) + shadcn surface tokens (`--background`, `--foreground`, `--card`, `--border`, `--ring`…). Components reference ONLY these.
- **Layer 3 — register + theme**: register is a **data attribute on a wrapping element** (`data-register="storefront" | "cockpit"`); theme is a **class on `<html>`** (`.dark`). Both re-map Layer-2 values. Dark only ever applies inside cockpit (`.dark[data-register="cockpit"]`); storefront is light-only.
- shadcn HSL convention: variables hold **space-separated HSL channels** (`222 47% 11%`), consumed as `hsl(var(--token))`. This is what lets `bg-target/10` and `/ <alpha-value>` work in Tailwind.

```
:root (storefront, light)        → default semantic values
[data-register="cockpit"]        → denser surfaces, hairline borders, no card shadow
.dark[data-register="cockpit"]   → inverted surfaces (added later, §5.2.3)
```

---

### 5.1 The two-register system

One product, two "rooms." Register is selected by **route group**, not by a user toggle.

| Aspect | **Storefront** register | **Cockpit** register |
|---|---|---|
| Routes | `(auth)/login`, `/catalog`, `/p/[slug]`, catalog peek Sheet `(.)p/[slug]` | `/products`, `/board`, `/pipeline`, `/dashboard`, `/shortlist`, `/exports`, `/settings/*`, `/import` |
| Feel | light, roomy, imagery-forward | dense, scannable, broker-grade |
| Base background | `--background` `0 0% 100%` (pure white) with `--muted` `210 20% 96%` wash sections | `--background` `210 20% 98.5%` (faint cool gray) so white cards/rows lift |
| Card surface | `--card` white, **elevated** (`--shadow-card`) | `--card` white, **flat** — separated by **hairline borders**, NOT shadow |
| Separation primitive | shadow + generous whitespace | 1px hairline divider `--border` (`214 20% 91%`); zebra optional `bg-muted/40` |
| Default density | row min-height 56px, cell py 12px | table row 36px (28px ultra-dense board), cell py 6–8px, virtualized |
| Base font size | 15px body, 16px+ lead | 13px body, 12px table cells |
| Radius default | `--radius` 12px | `--radius` 8px; tables/cells 6px; inputs 6px |
| Spacing rhythm | 8-pt with frequent 24/32/48 gaps | 4-pt with frequent 4/8/12 gaps |
| Imagery | hero images 4:5 / 1:1, rounded | thumbnails 32–40px, square, `rounded-sm` |
| Motion | softer (200ms) | snappier (120–150ms) |
| Max content width | `max-w-7xl` centered, gutters | full-bleed, no max width; horizontal scroll allowed |
| Dark mode | not supported (light only) | dark-capable (§5.2.3) |

**Switching mechanism.** Each route-group layout sets `data-register` on its root and chooses the body font-size class. The authenticated shell (top bar, ⌘K palette, role badge) is **register-neutral** and reads `--background`/`--foreground` so it adapts automatically.

```html
<div data-register="storefront" class="text-[15px]"> … catalog … </div>
<div data-register="cockpit"    class="text-[13px]"> … board … </div>
```

**Shared across both registers** (never re-mapped): all semantic color tokens, the mono/tabular rule, the focus ring, role-accent dots, and the two custom components (`<EconomicsWaterfall>`, `<CostStackEditor>`). The waterfall and PASS-lamp look identical in a catalog PDP and on the board.

---

### 5.2 Color

#### 5.2.1 Primitive palette (raw ramps)

Neutral is **cool slate** (Tailwind `slate`). Semantic hues are pinned to specific Tailwind shades so they read at AA on white and on dark surfaces.

| Role hue | 50 | 100 | 300 | 500 (DEFAULT) | 600 (text-on-white) | 700 | 900 |
|---|---|---|---|---|---|---|---|
| Slate (neutral) | `#f8fafc` | `#f1f5f9` | `#cbd5e1` | `#64748b` | `#475569` | `#334155` | `#0f172a` |
| Indigo (**Target** + focus only) | `#eef2ff` | `#e0e7ff` | `#a5b4fc` | `#6366f1` | `#4f46e5` | `#4338ca` | `#312e81` |
| Amber (**Quoted / owner-edit / needs-photo / Owner-dot**) | `#fffbeb` | `#fef3c7` | `#fcd34d` | `#f59e0b` | `#d97706` | `#b45309` | `#78350f` |
| Emerald (**PASS / Go**) | `#ecfdf5` | `#d1fae5` | `#6ee7b7` | `#10b981` | `#059669` | `#047857` | `#064e3b` |
| Rose (**FAIL**) | `#fff1f2` | `#ffe4e6` | `#fb7185` | `#f43f5e` | `#e11d48` | `#be123c` | `#881337` |
| Violet (**Partner / market / override / terminology**) | `#f5f3ff` | `#ede9fe` | `#c4b5fd` | `#8b5cf6` | `#7c3aed` | `#6d28d9` | `#4c1d95` |

> **Indigo vs violet are pinned, not interchangeable.** **Indigo is reserved for the Target value/column and the focus ring — nothing else.** **Violet is the Partner / market-side / per-product-override / terminology accent — always, and always as a hollow (ring-only) treatment for presence/override chrome.** Where both could appear (a partner-overridden Target), the **value stays indigo** and the **override chip is violet**, giving a clean figure/ground split. Never write "indigo/violet" for Partner — Partner is violet, full stop.

#### 5.2.2 Semantic tokens (light — `:root`, both registers)

HSL channels for shadcn. Each carries a paired `-fg` where it can hold text or a glyph.

| Token | Tailwind alias | Meaning / where | Value (light) | `-fg` |
|---|---|---|---|---|
| `--background` | `bg-background` | page (storefront white / cockpit faint gray, §5.1) | `0 0% 100%` / `210 20% 98.5%` | — |
| `--foreground` | `text-foreground` | primary text | `222 47% 11%` (`#0f172a`) | — |
| `--muted` | `bg-muted` | washes, zebra, disabled | `210 20% 96%` | `--muted-fg` `215 16% 38%` |
| `--card` | `bg-card` | surfaces | `0 0% 100%` | `--card-fg` = foreground |
| `--border` | `border-border` | **hairline** dividers | `214 20% 91%` (`#dde3ea`) | — |
| `--border-strong` | `border-border-strong` | emphasized rule, table-head underline | `214 18% 82%` | — |
| `--input` | — | input border | `214 20% 88%` | — |
| `--ring` | `ring-ring` | focus ring (**indigo, reserved**) | `239 84% 67%` (indigo-500) | — |
| `--primary` | `bg-primary` | primary action (neutral slate, NOT a semantic hue) | `222 47% 18%` | `--primary-fg` `0 0% 100%` |
| `--secondary` | `bg-secondary` | secondary action | `210 20% 94%` | `215 25% 27%` |
| `--target` | `text-target` `bg-target` | **Target** value/column | `239 84% 67%` (indigo-500) | `0 0% 100%` |
| `--target-muted` | `bg-target-muted` | Target tint fill | `226 100% 97%` (indigo-50) | `--target` |
| `--quoted` | `text-quoted` | **Quoted** value/column (cost side) | `38 92% 50%` (amber-500) | `26 83% 14%` |
| `--quoted-muted` | `bg-quoted-muted` | Quoted tint | `48 100% 96%` (amber-50) | `32 81% 29%` (amber-700) |
| `--actual` | `text-actual` | **Actual** value/column | `215 16% 47%` (slate-500) | `0 0% 100%` |
| `--actual-muted` | `bg-actual-muted` | Actual tint | `210 20% 96%` | `--actual` |
| `--pass` | `text-pass` | **PASS / Go** lamp & state | `160 84% 39%` (emerald-600) | `0 0% 100%` |
| `--pass-muted` | `bg-pass-muted` | PASS tint badge | `152 76% 94%` (emerald-100) | `163 88% 20%` (emerald-800) |
| `--fail` | `text-fail` | **FAIL** state | `347 77% 50%` (rose-600) | `0 0% 100%` |
| `--fail-muted` | `bg-fail-muted` | FAIL tint badge | `356 100% 95%` (rose-100) | `343 80% 30%` (rose-800) |
| `--warn` | `text-warn` | headroom-tight / caution (amber, glyph-gated) | `38 92% 50%` | `26 83% 14%` |
| `--partner` | `text-partner` | **Partner / market / override / terminology** | `258 90% 66%` (violet-500) | `0 0% 100%` |
| `--partner-muted` | `bg-partner-muted` | override chip / partner tint | `252 100% 97%` (violet-50) | `263 70% 35%` (violet-800) |
| `--needs-photo` | `text-needs-photo` | image-quality flag (amber family, glyph-required) | `38 92% 50%` | `26 83% 14%` |
| `--accent-owner` | `bg-accent-owner` | **role dot — Owner** | `38 92% 50%` (amber, **filled**) | — |
| `--accent-partner` | `bg-accent-partner` | **role dot — Partner** | `258 90% 66%` (violet, **hollow ring**) | — |

#### 5.2.2a The amber-overload disambiguation matrix (mandatory)

Amber carries **four** distinct meanings. They are never told apart by hue — each has a **mandatory distinct glyph + label**, and no two amber meanings may sit adjacent without that glyph+label present. Prefer the figure/ground rule: **amber *fills* (column tint, lamp, badge) always mean Quoted**; owner-edit uses a glyph on neutral, not an amber fill.

| Amber meaning | Mandatory glyph | Treatment | Label / caption |
|---|---|---|---|
| **Quoted** column / value | `FileText` | amber fill / tint / lamp | header "Factory quote" |
| **Owner-edit** affordance | `Pencil` | amber-600 text/glyph on **neutral** (no amber fill) | authorship caption "set by {memberName} · {relativeTime}" |
| **Needs-photo** flag | `Camera` (`ImageOff` family) | amber on placeholder + export-excluded badge | "Clean photo needed" |
| **Owner role-dot** | **filled dot** (shape *is* the glyph) | solid amber circle | name tooltip / role badge |

#### 5.2.3 Dark cockpit (layered later — `.dark[data-register="cockpit"]`)

Storefront stays light forever. Cockpit dark is **additive**: only Layer-2 surface tokens and a few hue lightnesses flip; semantic hue *identities* never change (Target is still indigo, Partner still violet). Hues shift **up the ramp** (≈400) to hit AA on the dark surface.

| Token | Dark value | Note |
|---|---|---|
| `--background` | `222 47% 9%` (`#0e1525`) | deep slate, not pure black |
| `--card` | `222 40% 13%` | one step up from bg |
| `--foreground` | `210 20% 92%` | off-white |
| `--muted` | `222 30% 18%` | zebra / wash |
| `--muted-fg` | `215 16% 62%` | secondary text |
| `--border` | `216 24% 22%` | hairline still 1px, lower contrast |
| `--target` | `234 89% 74%` (indigo-400) | AA on dark |
| `--quoted` | `43 96% 56%` (amber-400) | |
| `--actual` | `214 20% 69%` (slate-400) | |
| `--pass` | `158 64% 52%` (emerald-400) | |
| `--fail` | `350 95% 71%` (rose-400) | |
| `--partner` | `255 92% 76%` (violet-400) | |
| `--ring` | `234 89% 74%` | indigo, reserved |
| `--shadow-*` | mostly removed | dark cockpit separates by border + bg step, not shadow |

#### 5.2.4 Required-contrast notes (WCAG)

- **Body & all money/spec values**: foreground on background ≥ **7:1** (AAA) — load-bearing numbers stay high.
- **Secondary captions** (`muted-fg`): ≥ **4.5:1** (AA).
- **Semantic text on white**: use the **600/700** shade, not 500. Verified ≥ 4.5:1 — indigo-600 4.6; **amber-500 fails as text (below AA) → use amber-700 4.7 for amber *text*, amber-500 only as fill/lamp/dot**; emerald-600 3.6 → **use emerald-700 (5.1) for emerald *text***; rose-600 4.7; violet-600 4.6; slate-600 7.0.
- **Tint badges** (`*-muted` fill + `*-muted-fg` text): each pair verified ≥ 4.5:1 (emerald-100/emerald-800 ≈ 8:1).
- **Focus ring**: 2px ring + 2px offset → effective contrast ≥ 3:1 against any adjacent surface.
- **Hairline borders** are decorative-adjacent — **never the sole carrier of meaning** (a real boundary also has a bg step or label); 3:1 only where they delineate an input/control.
- **Lamp/dot colors** are reinforced by glyph + label (§5.7), so 3:1 non-text is a floor, not the meaning.

---

### 5.3 Typography

#### 5.3.1 Families

| Token | Stack | Use |
|---|---|---|
| `--font-sans` | `"Inter", "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | all UI text; Inter `cv05, cv08, ss01`; `font-feature-settings: "cv05" 1, "cv08" 1;` |
| `--font-mono` | `"Geist Mono", "JetBrains Mono", "SFMono-Regular", "Roboto Mono", ui-monospace, monospace` | **all money, %, SKU, model, ASIN, external_ref, MOQ, lead-time, BSR, dimensions** |
| Numeric feature | `font-variant-numeric: tabular-nums;` | every numeric/mono token so digits don't jitter on live recompute |

Loaded via `next/font` (self-hosted, `font-display: swap`, no FOUT). Inter & Geist Mono are source-of-truth; the rest are fallbacks.

#### 5.3.2 THE MONO + TABULAR RULE (non-negotiable)

> Any value that is a **number with business meaning** OR an **identifier code** renders in `--font-mono` + `tabular-nums`. Single utility class `.numeric` = `font-mono tabular-nums [font-feature-settings:"tnum","ss01"]`.

Applies to: target sell price, factory quote / landed-cost DDP, actual cost, net/unit, **all percentages** (margin %, opex %, headroom %, `match_confidence`), MOQ, lead-time days, supplier price refs, competitor price, ★rating value, review count, est. monthly sales, BSR, dimensions/spec values (`1200 W`, `220 V`), **SKU, model, ASIN, external_ref**. Prose, names, titles, marketplace names, and labels stay in `--font-sans`. The `220 V` value is mono; its warning label is sans.

#### 5.3.3 Type scale

Register-aware where noted (storefront / cockpit). Weights: Inter 400/500/600/700.

| Token | Element | Size (storefront / cockpit) | Weight | LH | Tracking | Notes |
|---|---|---|---|---|---|---|
| `text-display` | login hero / empty-state hero | 36 / — | 700 | 1.1 | -0.02em | storefront only |
| `text-h1` | page title | 28 / 20 | 600 | 1.2 | -0.015em | |
| `text-h2` | section / card title | 20 / 16 | 600 | 1.25 | -0.01em | |
| `text-h3` | sub-section | 16 / 14 | 600 | 1.3 | -0.005em | |
| `text-section-label` | **section eyebrow** ("Targets", "Factory quote", "Economics") | 11 / 11 | 600 | 1.2 | **+0.06em** | `uppercase`, `muted-fg`. Defining label style of the app. |
| `text-body` | default copy | 15 / 13 | 400 | 1.55 / 1.5 | 0 | |
| `text-body-strong` | emphasized inline | 15 / 13 | 600 | 1.5 | 0 | |
| `text-caption` | authorship ("set by {memberName} · {relativeTime}"), helper | 12 / 11 | 400 | 1.4 | 0 | `muted-fg` |
| `text-table-cell` | dense table data | — / 12 | 400 | 1.3 | 0 | numeric cells add `.numeric` |
| `text-table-head` | column header | 11 / 11 | 600 | 1.2 | +0.04em | `uppercase`, `muted-fg`, right-aligned for numbers |
| `text-badge` | chips, status, role labels | 11 / 11 | 600 | 1 | +0.02em | |
| `text-money-lg` | hero price in Deal Panel / PDP | 24 / 20 | 600 | 1.1 | -0.01em | mono + tabular |
| `text-money-sm` | inline price in rows | 13 / 12 | 500 | 1.2 | 0 | mono + tabular |
| `text-kbd` | ⌘K hints | 11 / 11 | 500 | 1 | 0 | mono |

- **Alignment**: numeric columns right-align; the unit (`%`, `$`, `V`, `W`) shares the cell with a thin space, never wraps.
- **Truncation**: titles `truncate` + `title=` tooltip; codes (ASIN/model/external_ref) **never** truncate mid-value — they wrap or scroll, since a partial code is dangerous.
- **`—` (em dash)** is the canonical empty/guarded value (`sellPrice ≤ 0` → `—`), rendered mono `muted-fg`, never `$0.00`, never `NaN`.

---

### 5.4 Spacing, sizing, radii, borders, elevation

#### 5.4.1 Spacing scale (4-pt, with named app gaps)

| Name | px | Use |
|---|---|---|
| `space-0.5` | 2 | icon-to-label nudge, lamp glyph gap |
| `space-1` | 4 | cockpit cell padding, chip inner |
| `space-2` | 8 | base unit, control inner padding |
| `space-3` | 12 | cockpit card / row padding |
| `space-4` | 16 | default block gap |
| `space-6` | 24 | storefront card padding, section gap |
| `space-8` | 32 | storefront section gap |
| `space-12` | 48 | storefront page rhythm / hero |
| `space-16` | 64 | login vertical centering |

Density rule: cockpit composes from {2,4,8,12}; storefront from {8,16,24,32,48}.

#### 5.4.2 Component sizing

| Element | Storefront | Cockpit |
|---|---|---|
| Button height (default / sm) | 40 / 32 | 32 / 28 |
| Input height | 40 | 32 |
| Table row height | 56 | 36 (28 ultra-dense board) |
| Table cell px / py | 16 / 12 | 8 / 6 |
| Top bar height | 56 | 52 |
| Thumbnail | 64–96 | 32–40 |
| Touch target min | 44×44 | 44×44 (invisible overlay even if visual is 28) |
| Deal Panel width (PDP docked) | 360–400 | — |
| Peek Sheet width | 480–560 | — |

#### 5.4.3 Radii

| Token | px | Use |
|---|---|---|
| `--radius` (base) | 12 (storefront) / 8 (cockpit) | cards, buttons, images |
| `--radius-lg` | 16 | hero cards, sheets, modals |
| `--radius-md` | 8 | inputs, secondary cards |
| `--radius-sm` | 6 | table cells, badges, thumbnails, chips |
| `--radius-full` | 9999 | role dots, lamp, avatar, pill toggles |

Tailwind: `borderRadius: { lg: 'var(--radius-lg)', md: 'var(--radius-md)', sm: 'var(--radius-sm)', DEFAULT: 'var(--radius)' }`.

#### 5.4.4 Borders (hairline doctrine)

- Default width **1px**, color `--border`. On HiDPI keep 1px (don't go sub-pixel — it disappears).
- `--border-strong` for table-head underline, the line under the Deal Panel header, group separators.
- Cockpit tables: vertical column separators **omitted** — rely on alignment + horizontal hairlines + optional zebra `bg-muted/40`; horizontal row separator 1px `--border`.
- Accent rings (live column, override, focus, presence) are **rings / box-shadows**, never the 1px border, so they never shift layout.

#### 5.4.5 Elevation / shadow

Shadows are a **storefront** device; cockpit uses borders. All cool-tinted (slate), low-spread.

| Token | Value | Use |
|---|---|---|
| `--shadow-xs` | `0 1px 2px 0 rgb(15 23 42 / 0.05)` | hover lift on chips/buttons |
| `--shadow-card` | `0 1px 3px 0 rgb(15 23 42 / 0.07), 0 1px 2px -1px rgb(15 23 42 / 0.06)` | storefront cards |
| `--shadow-popover` | `0 4px 12px -2px rgb(15 23 42 / 0.10), 0 2px 6px -2px rgb(15 23 42 / 0.08)` | dropdowns, ⌘K palette, tooltips |
| `--shadow-sheet` | `0 16px 48px -12px rgb(15 23 42 / 0.20)` | peek Sheet, Deal Panel float (mobile), RFQ drawer |
| `--shadow-dialog` | `0 24px 64px -16px rgb(15 23 42 / 0.28)` | modal / dialog |
| (cockpit cards) | **none** | flat + hairline |

Dark cockpit: drop card/sheet shadows to near-zero; overlays keep a faint `rgb(0 0 0 / 0.5)` scrim instead.

---

### 5.5 Motion (functional only — never decorative)

Respect `prefers-reduced-motion`: all collapse to instant state-swaps (duration 0) **except** the focus ring.

| Token | Value |
|---|---|
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` (default for enters) |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` (lamp only, tiny overshoot) |
| `--dur-1` | 80ms — micro (hover, checkbox) |
| `--dur-2` | 120ms — cockpit transitions, row select |
| `--dur-3` | 150ms — **the tabular roll**, default control |
| `--dur-4` | 200ms — storefront enters, sheet content |
| `--dur-5` | 280ms — sheet / drawer slide |

| Motion | Spec |
|---|---|
| **Waterfall tabular roll** | On input change, changed numbers re-count over **150ms** `--ease-out`, per-digit `tabular-nums` so columns don't reflow. Only the *delta* animates; unchanged digits static. Suppressed under reduced-motion (snap). |
| **PASS-lamp pulse** | FAIL→PASS (or headroom flips positive): single scale pulse 1.0→1.12→1.0 over 240ms `--ease-spring` + one-shot ring fade. Never loops, never idles. PASS→FAIL: no pulse, instant recolor (don't celebrate a failure). |
| **Live-column ring** | Active econ column (Quoted › Actual › Target) carries a 2px accent ring; on reassign, ring cross-fades 150ms. |
| **Realtime presence outline** | Remote user editing → 2px **dashed** outline in that user's role accent (amber=Owner, violet=Partner) fades in (120ms) and breathes opacity 0.6↔1.0 at 2s while held; releases 120ms. Outline only; never moves layout. Presence avatars fade 150ms. |
| **Optimistic edit** | Local edit applies instantly; if Realtime reconciles to a different value, cell does a 150ms roll to the corrected number + a 1s amber→transparent flash ("server adjusted"). |
| **Pipeline / Kanban move** | Drag uses transform only; drop settles 200ms `--ease-out`; a remote move animates old→new column over 200ms so the partner sees it travel, not teleport. |
| **Sheet / drawer** | Peek Sheet & RFQ drawer slide from right 280ms `--ease-out`; backdrop scrim 200ms. ↑/↓ in peek cross-fades content 150ms (no slide). |
| **Override chip** | Appears 120ms fade+2px rise when a field diverges from global; reset returns value via 150ms roll. |
| **Skeleton / image load** | `clean-photo-needed` / `reshoot` / `missing` / loading → **static branded "Studio photo pending" placeholder** (never a spinner, never a broken-image icon). Table skeletons: single 1.2s low-contrast shimmer; reduced-motion → static muted block. |
| **Toasts** | Slide-up + fade 200ms; auto-dismiss; success = emerald glyph, error = rose glyph. |

No parallax, no scroll-jacking, no decorative looping.

---

### 5.6 Iconography

- **Library**: `lucide-react` (matches shadcn). Stroke-based; `--icon-xs` 14, `--icon-sm` 16 (default), `--icon-md` 20, `--icon-lg` 24. Stroke 1.75 at ≤16, 2 at ≥20. Icons inherit `currentColor` → take the semantic text color automatically. `gap-2` (8px) label spacing; never icon-only for a meaning-bearing control without `aria-label`.

| Concept | Icon | Notes |
|---|---|---|
| PASS / Go | `Check` / `CircleCheck` | always paired with "PASS" label |
| FAIL | `X` / `CircleX` | "FAIL" label |
| Headroom tight / caution | `TriangleAlert` | warn / amber |
| Lock (you're the other role) | `Lock` | on read-only fields |
| **Owner-edit affordance** | `Pencil` | amber on neutral (see §5.2.2a) |
| **Owner role-dot** | filled dot | solid amber |
| **Partner authorship / role-dot** | hollow ring | violet |
| Override (per-product vs global) | `GitBranch` | violet "Overriding global" chip; reset = `RotateCcw` |
| Quoted | `FileText` / `Tag` | amber (mandatory glyph) |
| Needs photo / clean-photo | `Camera` / `ImageOff` / `ImageUp` | amber, on placeholder + export-excluded badge |
| Reshoot | `CameraOff` | distinct from clean-photo |
| 220 V landmine | `Zap` + `TriangleAlert` | flag on appliance spec |
| Quarantined image (excluded from export) | `ShieldAlert` / `Ban` | wrong-product image |
| Target | `Target` | indigo |
| Actual | `Receipt` | slate |
| Tier pursue / maybe / pass | `Star` / `CircleDashed` / `MinusCircle` | selections |
| Pipeline stages | `Inbox`→`Bookmark`→`Calculator`→`FileText`→`Flag` | New / Shortlisted / Costing / Quoted / Decision |
| Marketplace badge | small wordmark/logo chip | text fallback if no logo |
| Command palette | `Command` / `Search` | ⌘K |
| Export (RFQ/Excel/PDF) | `FileSpreadsheet` / `FileDown` | |
| Import / dropzone | `Upload` / `FileUp` | |
| Sort by headroom/net | `ArrowUpDown` | |
| Grid ↔ table toggle | `LayoutGrid` / `Table` | catalog |
| Kanban toggle | `Columns3` | board `?mode=` |
| Search-profile editor | `SlidersHorizontal` | PDP advanced drawer (§5.8.3) |
| Star rating | `Star` (filled fraction) | mono value beside it |

---

### 5.7 Colorblind-safe redundancy (the iron rule)

> **No state is ever communicated by color alone.** Every colored state carries a redundant glyph AND/OR text label. Color is reinforcement, not the signal.

| State | Color | + Glyph | + Label / shape |
|---|---|---|---|
| PASS | emerald | `Check` | "PASS" + filled (solid) lamp |
| FAIL | rose | `X` | "FAIL" + hollow / struck lamp |
| Headroom tight | amber | `TriangleAlert` | "tight" / headroom % shown |
| Target column | indigo | `Target` | header "Targets" |
| Quoted column | amber | `FileText` | header "Factory quote" |
| Actual column | slate | `Receipt` | header "Actual" |
| Owner edit | amber | `Pencil` | "set by {memberName} · {relativeTime}" |
| Partner edit | violet | hollow-ring dot | "set by {memberName} · {relativeTime}" |
| Override active | violet | `GitBranch` | "Overriding global" chip text |
| Needs photo | amber | `Camera` / `ImageOff` | "Clean photo needed" on placeholder |
| 220 V | amber | `Zap`+`TriangleAlert` | "Listed at 220 V — confirm US (110 V) sourcing" |
| Live econ column | accent ring (shape) | ring + `aria-current` | — |
| Presence (Owner vs Partner) | amber vs violet outline | initials avatar + name tooltip (color is NOT the sole differentiator) | — |

The PASS/FAIL **lamp** encodes redundantly: PASS = solid-filled circle + check; FAIL = ring-only circle + x — distinguishable in pure grayscale.

#### Focus / keyboard / a11y standards

- **Focus ring**: `--ring` (indigo), `box-shadow: 0 0 0 2px var(--background), 0 0 0 4px hsl(var(--ring))`. `:focus-visible` only. Visible on EVERY interactive element including table rows, chips, lamp, slider thumb.
- **Keyboard**: ⌘K palette global; catalog peek `↑/↓` prev/next, `Esc` close; tables fully arrow-navigable (roving tabindex), `Enter` to inline-edit, `Esc` cancel, `Tab` commits; Kanban cards keyboard-movable (`Space` grab, arrows move, `Space` drop) with `aria-live` announcements.
- **ARIA**: lamp `role="status"` `aria-label="Margin check: PASS, 4 points of headroom"`; live recompute `aria-live="polite"` (debounced, not every keystroke); override chip `aria-pressed`; read-only fields `aria-disabled` + lock glyph + authorship caption.
- **Targets**: min 44×44 interactive area even when the visual control is 28px.
- **Sliders** (calculator): keyboard-steppable, value echoed in a mono input, `aria-valuetext` includes units.
- **Reduced motion**: honor `prefers-reduced-motion` (§5.5). **Forced-colors**: `@media (forced-colors: active)` fallbacks switch lamp/chip bg to system `ButtonText`/`Highlight` and keep glyphs. Never rely on hover to reveal meaning; never use placeholder text as the only label.

---

### 5.8 Custom-component token contracts

#### 5.8.1 `<EconomicsWaterfall>` — the 3-column Target | Quoted | Actual P&L

Reimagined buy-box. Renders `sell → −opex(49%) → landed [Target/Quoted/Actual] → net/unit (each with %)` across three value columns + the PASS/headroom lamp. Register-agnostic.

| Prop / token | Type | Token mapping / behavior |
|---|---|---|
| `targets` | `{ sellPrice, landedTarget, opexPct, netUnit, netPct }` | indigo column (`--target` / `--target-muted` header tint, `Target` icon, label "Targets") |
| `quote` | `{ landedQuoted, moq, leadTimeDays, supplier } \| null` | amber column (`--quoted` + `FileText`, label "Factory quote") |
| `actual` | `{ landedActual } \| null` | slate column (`--actual` + `Receipt`, label "Actual") |
| `liveColumn` (derived) | `'quoted' \| 'actual' \| 'target'` | precedence Quoted › Actual › Target; 2px accent ring (`ring-[--quoted]` etc.) + `aria-current` |
| `status` | `'pass' \| 'fail'` | lamp: `--pass`+`Check`+"PASS" / `--fail`+`X`+"FAIL" |
| `headroomPct` | number | beside lamp; ≤2pts → amber "tight" + `TriangleAlert` |
| Row labels | section-label style | "Sell", "Operating costs (49%)", "Landed cost", "Net / unit" |
| Number rendering | `.numeric` | every figure; `%` suffixed; **gross (COGS≤35%) and net (≈16%) never adjacent, never same color** — gross = neutral foreground, net = pass/fail color; both always carry "%" + a word ("gross"/"net") |
| Guard | — | `sellPrice ≤ 0` or missing → `—` `muted-fg`, lamp neutral/disabled, NO NaN/$0 |
| Roll | `--dur-3` / `--ease-out` | changed figures roll; unchanged static |
| Empty column | placeholder | "No quote yet" / "No actual yet" `muted-fg`, column `opacity-60`, not collapsed |
| Layout | grid `[label | target | quoted | actual]` | right-aligned numerics; density inherited from register, no prop |
| a11y | `role="table"` | column headers `scope="col"`; lamp `role="status"` |

**Terminology safeguard baked in:** the component refuses to render gross% and net% in the same row or same color; opex (49%) sits visually between the gross-margin framing and the net result.

#### 5.8.2 `<CostStackEditor>` — global cost-stack + per-product override

Edits the cost stack (referral 15 / ads 15 / FBA 15 / returns 4 = 49% opex, + 0% partner-split) and target gross (65% → landed ≤35% of sell). Lives in `/settings/assumptions` (global) and inline on the PDP (per-product override).

| Prop / token | Behavior / token |
|---|---|
| `scope` | `'global' \| 'product'` |
| `values` | each line `{ key, label, pct }`; pct inputs `.numeric`; sliders + mono number field synced |
| `derived` | `opexTotal` (must read 49%), `targetGrossPct` (65%), `targetLandedPct` (≤35%) — recompute every keystroke (`--dur-3` roll) |
| Override state (product scope) | line ≠ global → violet `--partner` / `--partner-muted` "Overriding global" chip + `GitBranch` + `RotateCcw` reset; chip `aria-pressed` |
| Authorship | each value "set by {memberName} · {relativeTime}"; if you're the other role → `Lock` + `aria-disabled`, edits blocked |
| Validation | sum sanity, non-negative, ≤100; invalid → rose inline message + `aria-invalid` |
| Ripple | global edit → optimistic local apply + Realtime broadcast → all open waterfalls roll to new values (`aria-live` summary) |
| Terminology guard | labels never put "gross" and "net" adjacent; opex lines grouped under "Operating costs", gross/landed framed separately, suffixed + differently colored |
| Slider thumb | focusable, `--ring`, `aria-valuetext` "Referral fee 15 percent" |
| Register | global view = storefront-roomy; inline override = cockpit-compact in Deal Panel |

#### 5.8.3 Photo-state enum + data-quality token contracts

The Portal designs for honest data-quality realities (across ~152 products: **70 RoyalStar appliances + 57 beauty + 25 Greenway**; **45/57** beauty images contain Chinese text, **24** flagged `needs_clean_photo`; **46/70** appliances list 220 V; **1** wrong-product image). One canonical enum drives every photo surface — `PhotoStateBadge`, `StudioPhotoPending`, `ImageGallery`, `VisionQaBadge` — consistently.

| `photoState` | Vision-QA verdict → state | Token / glyph | User-facing copy | Export behavior |
|---|---|---|---|---|
| `good` | passes vision QA, US-English, correct product | no badge | — | included |
| `clean-photo-needed` | non-English / text-overlay detected | `--needs-photo` amber + `Camera` | "Clean photo needed" / placeholder "Studio photo pending" | **excluded from RFQ** |
| `reshoot` | low-quality / unusable but correct product | amber + `CameraOff` | "Needs reshoot" | **excluded from RFQ** |
| `missing` | no image | `muted` + `StudioPhotoPending` | placeholder "Studio photo pending" (never broken-image icon) | excluded |
| (quarantine flag, orthogonal) | wrong-product detected | rose/`--fail` + `ShieldAlert`/`Ban` | "Image flagged wrong product — quarantined from exports" | **hard-excluded** |

Other data-quality copy tokens (calm, literal, no euphemism): 220 V → "Listed at 220 V — confirm US (110 V) sourcing" (`Zap`+`TriangleAlert`); Chinese-text image → "Image has non-English text — excluded from RFQ export"; missing cost → "No factory quote yet" (never "$0"); missing competitors → "No competitors found yet"; sparse specs → "Specs incomplete" (never fabricate).

#### 5.8.4 API-failure → UI-state token contracts

Every `api/*` route maps to a calm, actionable user-facing state — rose glyph, no blame, always a next step. These states share the toast / inline-error / empty-state token vocabulary above.

| Route(s) | Failure | UI state |
|---|---|---|
| `api/rfq`, `api/export` | exceljs / PDF generation failure | rose toast "Couldn't build the export — try again"; preview drawer stays open, retry inline |
| `api/rfq`, `api/export` | timeout | "Export is taking too long — we'll keep it building" + spinner-free progress; cancel offered |
| `api/import/quotes`, `import/products`, `import/greenway` | malformed CSV | inline row-level errors: "Couldn't import 3 rows — external_ref not found. Download skipped rows." |
| `api/import/*` | partial success | emerald "n imported" + amber "m skipped" summary, downloadable skip list |
| `api/enrich/keepa` | 429 / quota | amber "Keepa quota reached — enrichment paused, retry in {time}"; existing data preserved |
| `api/enrich/keepa` | partial enrich | row shows enriched fields + `—` for missing, caption "Partial data" |
| `api/ai/discover`, `ai/verify`, `ai/cleanup`, `ai/vision-qa`, `ai/taxonomy` | timeout | "Still working — this can take a moment" non-blocking banner |
| `api/ai/*` | 429 / quota | amber "AI quota reached — try again shortly", queued state, no data loss |
| `api/ai/discover` | `web_search` tool error | "Web search unavailable — showing Keepa results only" (graceful degrade to primary source) |
| any `api/ai/*` | malformed model output | rose inline "Couldn't parse the result — retry"; never renders partial/garbage |

---

### 5.9 Voice & copy (token-adjacent rules)

- **Sentence case everywhere** — buttons, headers, labels, toasts. Only proper nouns capitalized. Uppercase reserved for the small tracked `section-label` / `table-head` style.
- **Role-free, neutral labels.** Use **"Targets"** (market side) and **"Factory quote"** (cost side) — never "Partner sets" / "Owner enters." Other neutral labels: "Actual", "Net / unit", "Operating costs", "Headroom", "Landed cost (DDP)". Authorship lives only in runtime captions ("set by {memberName} · {relativeTime}"), never in field labels.
- **No branding.** Never a product or company mark in chrome. People are referred to by runtime name/role in captions only.
- **No marketese** ("powerful", "seamless", "unlock", "supercharge", exclamation marks). Verbs are literal: "Build factory RFQ", "Import quotes", "Set target sell", "Move to Quoted", "Mark as pass".
- **Numbers speak plainly**: always units + currency symbol; "%" always suffixed; gross vs net always disambiguated with the word; guarded values show "—" with a quiet "set a sell price to calculate" hint, never an error.
- **Errors are calm and actionable** (see §5.8.4); **empty states** describe the next action in one neutral sentence with the primary action inline.

---

### 5.10 Tailwind / shadcn wiring & token-verification (build checklist)

- `darkMode: ['class']`; register via `data-register` + a Tailwind plugin exposing variants: `addVariant('cockpit', '[data-register="cockpit"] &')`, `addVariant('storefront', '[data-register="storefront"] &')`.
- `theme.extend.colors` maps every Layer-2 token: `target: { DEFAULT: 'hsl(var(--target))', muted: 'hsl(var(--target-muted))', fg: 'hsl(var(--target-fg))' }`, …same for quoted / actual / pass / fail / partner / needs-photo, plus shadcn defaults (background / foreground / card / popover / primary / secondary / muted / accent / destructive / border / input / ring).
- `fontFamily.sans` / `mono` → the CSS vars; add the `.numeric` utility component class.
- `borderRadius`, `boxShadow`, `transitionDuration`, `transitionTimingFunction` all read the CSS vars above.
- `fontSize` map encodes §5.3.3 with `[size, { lineHeight, letterSpacing, fontWeight }]` tuples.
- All semantic colors usable with alpha (`bg-target/10`, `ring-quoted/40`) because tokens are HSL channels.
- Provide `globals.css` with `:root`, `[data-register="cockpit"]`, and `.dark[data-register="cockpit"]` blocks defining every variable in §5.2.2–5.2.3.

**Token-verification tests (CI gates — the token system is testable, not aspirational):**

- **Contrast test**: a script asserts every `text-*` / `*-muted-fg` pair in §5.2.2 against its surface ≥ its required ratio (§5.2.4); **fails the build** if any drops below AA (catches regressions like amber-500 used as text). Re-run for the dark-cockpit layer.
- **Color-alone test**: snapshot/visual-regression run with a grayscale filter asserts every state in §5.7 remains distinguishable by glyph/label (PASS-solid vs FAIL-ring lamp, Owner-filled vs Partner-hollow dot).
- **Reserved-hue lint**: a token-usage lint forbids `--target`/indigo on non-Target elements and `--ring`/indigo outside focus, and forbids `--partner`/violet outside Partner/override/terminology scope.
- **Amber-glyph lint**: assert no amber fill renders without its mandatory glyph (§5.2.2a); flag two amber meanings adjacent without distinct glyph+label.
- **Neutrality test**: a string-scan asserts no literal brand mark and no hard-coded member name ships in components — authorship must come from the `{memberName}` / `{relativeTime}` runtime props.
- **Guard test**: unit tests assert `sellPrice ≤ 0` / missing inputs render `—` (mono `muted-fg`) and never `NaN` / `$0` across `<EconomicsWaterfall>` and `<CostStackEditor>`.
- **Reduced-motion test**: assert all §5.5 motions collapse to instant under `prefers-reduced-motion`, with the focus ring exempt.

---

## Coverage checklist

- **Every surface in §1 has a flow in §2** (or is a system/status page with its own state in §4).
- **Every interactive component in §3 enumerates its states** — default / hover / focus / disabled / loading / empty / error / role-locked.
- **Every surface has empty / loading / error states in §4** (the canonical state matrix), including the cross-cutting system states (offline, session-expired, save-conflict).
- **Every `api/*` endpoint maps to a user-facing failure state in §4** (timeout, 429/quota, web-search tool error, export-generation failure, malformed CSV, partial enrich).
- **Naming, color, and photo-state are reconciled** to the Canonical conventions above — no "Viral"/"Yuno" literals, Partner = violet, Target = indigo, one photo-state enum, consistent 152/45/24/46/1 counts.

_Assembled from a 5-slice parallel design pass (pages, flows, components, states, design system) with an adversarial gap-critique. Completeness after reconciliation: 82/100 — remaining items are polish/Phase-2 depth, not missing surfaces._
