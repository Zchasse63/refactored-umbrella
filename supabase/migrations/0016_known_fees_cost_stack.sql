-- Known-fees economics: the site's margin math now bakes in ONLY fees we can source —
-- Amazon's 15% referral + the real per-unit FBA fee (swapped in from competitor data) —
-- plus an "Other fees" line the partner fills in (ads/returns/etc). Ads (15%) and returns
-- (4%) are no longer defaulted. Our booked cost is padded 7% in the calc engine (COST_BUFFER).
-- This mirrors the partner Excel backup so the site and the workbook show one number.
--
-- Also flips foodservice opex on: it is the Amazon-FIRST launch line (thank-you bags,
-- straws, liners), so it must carry the referral + real FBA stack, not a bare cost display.
--
-- Column DEFAULTs are updated for a fresh-DB bootstrap; the live singleton row (id=1) is
-- updated to match (idempotent — this is the value already running in production).

alter table public.assumptions
  alter column cost_stack set default
    '[{"key":"referral","label":"Referral","pct":0.15},
      {"key":"fba","label":"FBA logistics","pct":0.15},
      {"key":"other","label":"Other fees","pct":0}]';

alter table public.assumptions
  alter column line_opex_applies set default
    '{"appliance":true,"beauty":true,"foodservice":true}';

update public.assumptions set
  cost_stack = '[{"key":"referral","label":"Referral","pct":0.15},
                 {"key":"fba","label":"FBA logistics","pct":0.15},
                 {"key":"other","label":"Other fees","pct":0}]',
  line_opex_applies = '{"appliance":true,"beauty":true,"foodservice":true}'
where id = 1;
