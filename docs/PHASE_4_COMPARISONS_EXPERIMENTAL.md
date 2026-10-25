# Controlled first-year comparisons (LL-10): every experimental mechanic on

New-game rules plus every opt-in mechanic under Settings → Experimental mechanics (wearAndRepair, sellingAndTrade, foodPreservation, livestockLifecycle, shelterOccupancy, storagePools, toolGathering, soilFertility, householdRoles, finance, riskEvents, transportAccess), so a change to a gated mechanic shows up here even though a new game leaves it off. Regenerate with `npm run test:comparisons -- --update` (LL-50).

Start greenfield, two adults, 365 days. Each comparison changes one decision; every variant otherwise follows the tutorial route (each quest's own steps once, when it becomes current). Sites: front-range, laramie-wy, asheville-nc. Standard = average climate, one run per site. Real = real weather, seeds 1, 2, 3 per site. Cells show the median and (range) across runs. Rules: engine 0.9 new-game settings (employment below upkeep, $8,000/adult startup, site crew rates, no overdraft). See docs/PHASE_8.md for the before/after comparison.

Columns: short = days with any survival need below its shortage threshold while someone is home; min WB = lowest daily wellbeing (0 while in town); left = runs with any town departure / runs; away = days with someone in town; cash end / low; pantry = prepared Food days at the end; grown = home-grown share of food eaten over the year; jobs / build h = employment and construction hours over the run; wk1 jobs = employment hours / available hours in the first week, before any collapse; heater = day the Rocket Mass Heater was completed (— never); gifts = tutorial cash + market value of reward stock; missed = scheduled actions that failed.

## tutorial: Is viability dependent on gifts that are absent outside onboarding?

| Variant | Weather | short | min WB | left | away | cash end | cash low | pantry | grown | jobs h | wk1 jobs | build h | heater | gifts | missed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Tutorial on (gifts) | Standard | 1 | 75 (74–75) | 0/3 | 0 | $7,966 ($7,319–$8,005) | $7,966 ($7,319–$8,005) | 5 (4–5) | 13.4% (11.7%–14.2%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (22–72) | $3,273 ($2,773–$3,273) | 0 |
| Tutorial on (gifts) | Real | 1 | 75 (74–75) | 0/9 | 0 | $7,861 ($7,105–$8,030) | $7,861 ($7,105–$8,030) | 5 (3–10) | 13.3% (10.4%–14.2%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (22–72) | $3,273 ($2,773–$3,273) | 0 |
| Same actions, same days, tutorial skipped (no gifts) | Standard | 1 | 75 (74–75) | 0/3 | 0 | $4,349 ($3,641–$4,843) | $4,349 ($3,641–$4,843) | 5 (4–8) | 9.8% (8.0%–10.6%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (22–71) | $0 | 0 |
| Same actions, same days, tutorial skipped (no gifts) | Real | 1 | 75 (74–75) | 0/9 | 0 | $4,349 ($3,604–$4,843) | $4,349 ($3,604–$4,843) | 5 (4–9) | 9.8% (7.9%–10.6%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (22–71) | $0 | 0 |

## job: How much do income and competing labor determine success?

| Variant | Weather | short | min WB | left | away | cash end | cash low | pantry | grown | jobs h | wk1 jobs | build h | heater | gifts | missed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| No job | Standard | 1 | 75 (74–75) | 0/3 | 0 | $7,966 ($7,319–$8,005) | $7,966 ($7,319–$8,005) | 5 (4–5) | 13.4% (11.7%–14.2%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (22–72) | $3,273 ($2,773–$3,273) | 0 |
| No job | Real | 1 | 75 (74–75) | 0/9 | 0 | $7,861 ($7,105–$8,030) | $7,861 ($7,105–$8,030) | 5 (3–10) | 13.3% (10.4%–14.2%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (22–72) | $3,273 ($2,773–$3,273) | 0 |
| Part-time job (20 h, needs transport) | Standard | 1 | 75 (74–75) | 0/3 | 0 | $35,373 ($34,675–$35,650) | $16,000 | 5 (4–5) | 13.3% (11.6%–14.2%) | 1017 (1014–1029) | 17 (17–17) / 88 (88–88) | 89 (89–89) | 39 (26–74) | $3,273 ($2,773–$3,273) | 0 |
| Part-time job (20 h, needs transport) | Real | 1 | 75 (74–75) | 0/9 | 0 | $35,353 ($33,886–$35,669) | $16,000 | 5 (3–10) | 13.2% (10.3%–14.2%) | 1016 (999–1029) | 17 (17–17) / 88 (88–88) | 89 (89–89) | 39 (26–74) | $3,273 ($2,773–$3,273) | 0 |
| Remote job (40 h) | Standard | 1 | 75 (74–75) | 0/3 | 0 | $58,580 ($57,863–$58,922) | $16,000 | 5 (4–5) | 13.3% (11.5%–14.1%) | 2020 (2018–2038) | 32 (32–33) / 88 (88–88) | 89 (89–89) | 42 (32–77) | $3,273 ($2,773–$3,273) | 0 |
| Remote job (40 h) | Real | 1 | 75 (74–75) | 0/9 | 0 | $58,555 ($57,299–$58,935) | $16,000 | 5 (3–9) | 13.1% (10.2%–14.1%) | 2016 (1994–2038) | 32 (32–33) / 88 (88–88) | 89 (89–89) | 43 (32–77) | $3,273 ($2,773–$3,273) | 0 |

## shelter: Is there a viable shelter progression within the starter budget?

| Variant | Weather | short | min WB | left | away | cash end | cash low | pantry | grown | jobs h | wk1 jobs | build h | heater | gifts | missed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Starter tent only | Standard | 1 | 75 (74–75) | 0/3 | 0 | $7,966 ($7,319–$8,005) | $7,966 ($7,319–$8,005) | 5 (4–5) | 13.4% (11.7%–14.2%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (22–72) | $3,273 ($2,773–$3,273) | 0 |
| Starter tent only | Real | 1 | 75 (74–75) | 0/9 | 0 | $7,861 ($7,105–$8,030) | $7,861 ($7,105–$8,030) | 5 (3–10) | 13.3% (10.4%–14.2%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (22–72) | $3,273 ($2,773–$3,273) | 0 |
| Second inexpensive shelter (Bell Tent, DIY) on day 30 | Standard | 1 | 75 (74–75) | 0/3 | 0 | $7,666 ($7,019–$7,705) | $7,666 ($7,019–$7,705) | 5 (4–5) | 13.4% (11.7%–14.2%) | 0 | 0 / 88 (88–88) | 92 (92–92) | 35 (22–72) | $3,273 ($2,773–$3,273) | 0 |
| Second inexpensive shelter (Bell Tent, DIY) on day 30 | Real | 1 | 75 (74–75) | 0/9 | 0 | $7,561 ($6,805–$7,730) | $7,561 ($6,805–$7,730) | 5 (3–10) | 13.3% (10.4%–14.2%) | 0 | 0 / 88 (88–88) | 92 (92–92) | 35 (22–72) | $3,273 ($2,773–$3,273) | 0 |
| Yurt (DIY) on day 30 | Standard | 1 | 75 (74–75) | 0/3 | 0 | $2,003 ($1,319–$2,018) | $2,003 ($1,319–$2,018) | 5 (4–5) | 13.4% (11.7%–14.2%) | 0 | 0 / 88 (88–88) | 126 (126–126) | 35 (22–71) | $3,273 ($2,773–$3,273) | 0 |
| Yurt (DIY) on day 30 | Real | 1 | 75 (74–75) | 0/9 | 0 | $1,859 ($1,105–$2,102) | $1,859 ($1,105–$2,102) | 5 (3–10) | 13.2% (10.4%–14.2%) | 0 | 0 / 88 (88–88) | 126 (126–126) | 35 (22–72) | $3,273 ($2,773–$3,273) | 0 |
| Yurt on day 30; retire starter tent after completion | Standard | 2 (1–4) | 75 (74–75) | 0/3 | 0 | $2,018 ($1,319–$2,029) | $2,018 ($1,319–$2,029) | 5 (4–5) | 13.4% (11.7%–14.2%) | 0 | 0 / 88 (88–88) | 126 (126–126) | 35 (22–71) | $3,273 ($2,773–$3,273) | 0 |
| Yurt on day 30; retire starter tent after completion | Real | 2 (1–4) | 75 (74–75) | 0/9 | 0 | $1,876 ($1,105–$2,128) | $1,876 ($1,105–$2,128) | 5 (3–10) | 13.2% (10.4%–14.2%) | 0 | 0 / 88 (88–88) | 126 (126–126) | 35 (22–72) | $3,273 ($2,773–$3,273) | 0 |

## storage: Is water the intended first bottleneck, and is that discoverable?

| Variant | Weather | short | min WB | left | away | cash end | cash low | pantry | grown | jobs h | wk1 jobs | build h | heater | gifts | missed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Tutorial order, no added storage | Standard | 1 | 75 (74–75) | 0/3 | 0 | $7,966 ($7,319–$8,005) | $7,966 ($7,319–$8,005) | 5 (4–5) | 13.4% (11.7%–14.2%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (22–72) | $3,273 ($2,773–$3,273) | 0 |
| Tutorial order, no added storage | Real | 1 | 75 (74–75) | 0/9 | 0 | $7,861 ($7,105–$8,030) | $7,861 ($7,105–$8,030) | 5 (3–10) | 13.3% (10.4%–14.2%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (22–72) | $3,273 ($2,773–$3,273) | 0 |
| 550 gal cistern (DIY) on day 0, before crops | Standard | 1 | 75 (74–75) | 0/3 | 0 | $7,466 ($6,819–$7,505) | $7,466 ($6,819–$7,505) | 5 (4–5) | 13.4% (11.7%–14.2%) | 0 | 0 / 88 (88–88) | 100 (100–100) | 36 (22–72) | $3,273 ($2,773–$3,273) | 0 |
| 550 gal cistern (DIY) on day 0, before crops | Real | 1 | 75 (74–75) | 0/9 | 0 | $7,361 ($6,605–$7,530) | $7,361 ($6,605–$7,530) | 5 (3–10) | 13.2% (10.4%–14.2%) | 0 | 0 / 88 (88–88) | 100 (100–100) | 36 (22–72) | $3,273 ($2,773–$3,273) | 0 |
| Same cistern on day 90, after crops | Standard | 1 | 75 (74–75) | 0/3 | 0 | $7,466 ($6,819–$7,505) | $7,466 ($6,819–$7,505) | 5 (4–5) | 13.4% (11.7%–14.2%) | 0 | 0 / 88 (88–88) | 100 (100–100) | 35 (22–72) | $3,273 ($2,773–$3,273) | 0 |
| Same cistern on day 90, after crops | Real | 1 | 75 (74–75) | 0/9 | 0 | $7,361 ($6,605–$7,530) | $7,361 ($6,605–$7,530) | 5 (3–10) | 13.3% (10.4%–14.2%) | 0 | 0 / 88 (88–88) | 100 (100–100) | 35 (22–72) | $3,273 ($2,773–$3,273) | 0 |

## winter: Is the warning lead time sufficient for real construction ETAs?

| Variant | Weather | short | min WB | left | away | cash end | cash low | pantry | grown | jobs h | wk1 jobs | build h | heater | gifts | missed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Winter steps when the tutorial reaches them | Standard | 1 | 75 (74–75) | 0/3 | 0 | $7,966 ($7,319–$8,005) | $7,966 ($7,319–$8,005) | 5 (4–5) | 13.4% (11.7%–14.2%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (22–72) | $3,273 ($2,773–$3,273) | 0 |
| Winter steps when the tutorial reaches them | Real | 1 | 75 (74–75) | 0/9 | 0 | $7,861 ($7,105–$8,030) | $7,861 ($7,105–$8,030) | 5 (3–10) | 13.3% (10.4%–14.2%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (22–72) | $3,273 ($2,773–$3,273) | 0 |
| Heater, wood rule and order 60 days before first cold | Standard | 1 | 75 (74–75) | 0/3 | 0 | $7,530 ($7,466–$7,829) | $7,530 ($7,466–$7,829) | 5 (5–9) | 12.8% (11.3%–13.6%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 157 (95–202) | $2,773 ($2,773–$3,273) | 0 |
| Heater, wood rule and order 60 days before first cold | Real | 1 | 75 (74–75) | 0/9 | 0 | $7,544 ($6,817–$7,829) | $7,544 ($6,817–$7,829) | 5 (4–9) | 12.6% (10.0%–13.6%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 157 (95–202) | $2,773 ($2,773–$3,273) | 0 |
| The same 7 days before first cold | Standard | 2 (1–20) | 74 (18–75) | 0/3 | 0 | $7,571 ($6,819–$7,894) | $7,571 ($6,819–$7,894) | 8 (5–9) | 12.6% (11.0%–13.5%) | 0 | 0 / 88 (88–88) | 90 (89–90) | 209 (160–254) | $2,773 | 0 |
| The same 7 days before first cold | Real | 2 (1–34) | 74 (5–75) | 0/9 | 0 | $7,572 ($6,780–$7,894) | $7,572 ($6,780–$7,894) | 5 (4–9) | 12.5% (9.7%–13.5%) | 0 | 0 / 88 (88–88) | 90 (89–90) | 209 (160–254) | $2,773 | 0 |

## rescue: Does recovery have a reasonable price and duration?

| Variant | Weather | short | min WB | left | away | cash end | cash low | pantry | grown | jobs h | wk1 jobs | build h | heater | gifts | missed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Late heater built by household labor | Standard | 2 (1–20) | 74 (18–75) | 0/3 | 0 | $7,571 ($6,819–$7,894) | $7,571 ($6,819–$7,894) | 8 (5–9) | 12.6% (11.0%–13.5%) | 0 | 0 / 88 (88–88) | 90 (89–90) | 209 (160–254) | $2,773 | 0 |
| Late heater built by household labor | Real | 2 (1–34) | 74 (5–75) | 0/9 | 0 | $7,572 ($6,780–$7,894) | $7,572 ($6,780–$7,894) | 5 (4–9) | 12.5% (9.7%–13.5%) | 0 | 0 / 88 (88–88) | 90 (89–90) | 209 (160–254) | $2,773 | 0 |
| Late heater with a paid crew booked the same day | Standard | 2 (1–34) | 74 (0–75) | 1/3 | 0 (0–15) | $6,493 ($6,446–$6,994) | $6,493 ($6,446–$6,994) | 7 (5–8) | 12.6% (11.1%–13.5%) | 0 | 0 / 88 (88–88) | 33 (33–33) | 210 (148–255) | $2,773 | 0 |
| Late heater with a paid crew booked the same day | Real | 2 (1–34) | 74 (0–75) | 1/9 | 0 (0–15) | $6,493 ($5,840–$6,994) | $6,493 ($5,840–$6,994) | 5 (4–8) | 12.5% (9.7%–13.5%) | 0 | 0 / 88 (88–88) | 33 (33–33) | 210 (148–255) | $2,773 | 0 |

## stacking: Are per-person employment and labor limits enforced?

| Variant | Weather | short | min WB | left | away | cash end | cash low | pantry | grown | jobs h | wk1 jobs | build h | heater | gifts | missed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| One remote job | Standard | 1 | 75 (74–75) | 0/3 | 0 | $58,580 ($57,863–$58,922) | $16,000 | 5 (4–5) | 13.3% (11.5%–14.1%) | 2020 (2018–2038) | 32 (32–33) / 88 (88–88) | 89 (89–89) | 42 (32–77) | $3,273 ($2,773–$3,273) | 0 |
| One remote job | Real | 1 | 75 (74–75) | 0/9 | 0 | $58,555 ($57,299–$58,935) | $16,000 | 5 (3–9) | 13.1% (10.2%–14.1%) | 2016 (1994–2038) | 32 (32–33) / 88 (88–88) | 89 (89–89) | 43 (32–77) | $3,273 ($2,773–$3,273) | 0 |
| Three remote jobs for two adults | Standard | 1 | 75 (74–75) | 0/3 | 0 | $79,345 ($74,592–$81,510) | $16,000 | 9 (3–9) | 13.0% (11.1%–13.9%) | 2887 (2665–2941) | 49 (49–53) / 88 (88–88) | 89 (89–89) | 55 (52–70) | $3,273 ($2,773–$3,273) | 0 |
| Three remote jobs for two adults | Real | 1 | 75 (74–75) | 0/9 | 0 | $78,237 ($72,780–$81,167) | $16,000 | 9 (5–10) | 12.8% (9.9%–13.9%) | 2842 (2595–2936) | 49 (48–53) / 88 (88–88) | 89 (89–89) | 55 (49–84) | $3,273 ($2,773–$3,273) | 0 |

## Winter save rescue (recorded day-240 save, front range, zero resident labor, 90 days)

| Action | Prepaid | Home on day | Left again | Home at day 90 | Cash at day 90 | Lowest cash |
|---|---|---|---|---|---|---|
| Do nothing (zero resident labor) | $0 | — | no | no | $10,799 | $10,799 |
| Emergency construction only | $0 | — | no | no | $10,799 | $10,799 |
| Recovery route (crews, upkeep first, orders) | $1,207 | 1 | no | yes | $20,126 | $9,622 |
