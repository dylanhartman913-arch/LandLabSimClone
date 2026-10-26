# Controlled first-year comparisons (LL-10): every experimental mechanic on

New-game rules plus every opt-in mechanic under Settings → Experimental mechanics (wearAndRepair, sellingAndTrade, foodPreservation, livestockLifecycle, shelterOccupancy, storagePools, toolGathering, soilFertility, householdRoles, finance, riskEvents, transportAccess), so a change to a gated mechanic shows up here even though a new game leaves it off. Regenerate with `npm run test:comparisons -- --update` (LL-50).

Start greenfield, two adults, 365 days. Each comparison changes one decision; every variant otherwise follows the tutorial route (each quest's own steps once, when it becomes current). Sites: front-range, laramie-wy, asheville-nc. Standard = average climate, one run per site. Real = real weather, seeds 1, 2, 3 per site. Cells show the median and (range) across runs. Rules: engine 0.9 new-game settings (employment below upkeep, $8,000/adult startup, site crew rates, no overdraft). See docs/PHASE_8.md for the before/after comparison.

Columns: short = days with any survival need below its shortage threshold while someone is home; min WB = lowest daily wellbeing (0 while in town); left = runs with any town departure / runs; away = days with someone in town; cash end / low; pantry = prepared Food days at the end; grown = home-grown share of food eaten over the year; jobs / build h = employment and construction hours over the run; wk1 jobs = employment hours / available hours in the first week, before any collapse; heater = day the Rocket Mass Heater was completed (— never); gifts = tutorial cash + market value of reward stock; missed = scheduled actions that failed.

## tutorial: Is viability dependent on gifts that are absent outside onboarding?

| Variant | Weather | short | min WB | left | away | cash end | cash low | pantry | grown | jobs h | wk1 jobs | build h | heater | gifts | missed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Tutorial on (gifts) | Standard | 1 | 75 (74–75) | 0/3 | 0 | $8,000 ($7,492–$8,163) | $8,000 ($7,492–$8,163) | 5 (4–5) | 13.4% (11.6%–14.2%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (23–72) | $3,273 ($2,773–$3,273) | 0 |
| Tutorial on (gifts) | Real | 1 | 75 (74–75) | 0/9 | 0 | $7,944 ($7,163–$8,138) | $7,944 ($7,163–$8,138) | 5 (3–10) | 13.2% (10.3%–14.2%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (23–72) | $3,273 ($2,773–$3,273) | 0 |
| Same actions, same days, tutorial skipped (no gifts) | Standard | 1 | 75 (74–75) | 0/3 | 0 | $4,507 ($3,864–$4,976) | $4,507 ($3,864–$4,976) | 5 (4–8) | 9.7% (7.9%–10.6%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (23–71) | $0 | 0 |
| Same actions, same days, tutorial skipped (no gifts) | Real | 1 | 75 (74–75) | 0/9 | 0 | $4,504 ($3,827–$4,976) | $4,504 ($3,827–$4,976) | 5 (4–9) | 9.7% (7.9%–10.6%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (23–71) | $0 | 0 |

## job: How much do income and competing labor determine success?

| Variant | Weather | short | min WB | left | away | cash end | cash low | pantry | grown | jobs h | wk1 jobs | build h | heater | gifts | missed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| No job | Standard | 1 | 75 (74–75) | 0/3 | 0 | $8,000 ($7,492–$8,163) | $8,000 ($7,492–$8,163) | 5 (4–5) | 13.4% (11.6%–14.2%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (23–72) | $3,273 ($2,773–$3,273) | 0 |
| No job | Real | 1 | 75 (74–75) | 0/9 | 0 | $7,944 ($7,163–$8,138) | $7,944 ($7,163–$8,138) | 5 (3–10) | 13.2% (10.3%–14.2%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (23–72) | $3,273 ($2,773–$3,273) | 0 |
| Part-time job (20 h, needs transport) | Standard | 1 | 75 (74–75) | 0/3 | 0 | $35,357 ($34,764–$35,609) | $16,000 | 5 (4–5) | 13.3% (11.6%–14.1%) | 1017 (1014–1029) | 17 (17–17) / 88 (88–88) | 89 (89–89) | 39 (27–74) | $3,273 ($2,773–$3,273) | 0 |
| Part-time job (20 h, needs transport) | Real | 1 | 75 (74–75) | 0/9 | 0 | $35,312 ($34,061–$35,705) | $16,000 | 5 (3–10) | 13.2% (10.3%–14.1%) | 1016 (999–1029) | 17 (17–17) / 88 (88–88) | 89 (89–89) | 39 (27–74) | $3,273 ($2,773–$3,273) | 0 |
| Remote job (40 h) | Standard | 1 | 75 (74–75) | 0/3 | 0 | $58,624 ($57,973–$58,932) | $16,000 | 5 (4–5) | 13.2% (11.5%–14.1%) | 2019 (2018–2038) | 33 (32–33) / 88 (88–88) | 89 (89–89) | 42 (33–77) | $3,273 ($2,773–$3,273) | 0 |
| Remote job (40 h) | Real | 1 | 75 (74–75) | 0/9 | 0 | $58,523 ($57,186–$58,945) | $16,000 | 5 (3–9) | 13.1% (10.2%–14.1%) | 2016 (1994–2038) | 32 (32–33) / 88 (88–88) | 89 (89–89) | 43 (33–77) | $3,273 ($2,773–$3,273) | 0 |

## shelter: Is there a viable shelter progression within the starter budget?

| Variant | Weather | short | min WB | left | away | cash end | cash low | pantry | grown | jobs h | wk1 jobs | build h | heater | gifts | missed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Starter tent only | Standard | 1 | 75 (74–75) | 0/3 | 0 | $8,000 ($7,492–$8,163) | $8,000 ($7,492–$8,163) | 5 (4–5) | 13.4% (11.6%–14.2%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (23–72) | $3,273 ($2,773–$3,273) | 0 |
| Starter tent only | Real | 1 | 75 (74–75) | 0/9 | 0 | $7,944 ($7,163–$8,138) | $7,944 ($7,163–$8,138) | 5 (3–10) | 13.2% (10.3%–14.2%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (23–72) | $3,273 ($2,773–$3,273) | 0 |
| Second inexpensive shelter (Bell Tent, DIY) on day 30 | Standard | 1 | 75 (74–75) | 0/3 | 0 | $7,700 ($7,192–$7,863) | $7,700 ($7,192–$7,863) | 5 (4–5) | 13.4% (11.6%–14.2%) | 0 | 0 / 88 (88–88) | 92 (92–92) | 35 (23–72) | $3,273 ($2,773–$3,273) | 0 |
| Second inexpensive shelter (Bell Tent, DIY) on day 30 | Real | 1 | 75 (74–75) | 0/9 | 0 | $7,644 ($6,863–$7,838) | $7,644 ($6,863–$7,838) | 5 (3–10) | 13.2% (10.3%–14.2%) | 0 | 0 / 88 (88–88) | 92 (92–92) | 35 (23–72) | $3,273 ($2,773–$3,273) | 0 |
| Yurt (DIY) on day 30 | Standard | 1 | 75 (74–75) | 0/3 | 0 | $2,001 ($1,492–$2,161) | $2,001 ($1,492–$2,161) | 5 (4–5) | 13.3% (11.6%–14.2%) | 0 | 0 / 88 (88–88) | 126 (126–126) | 35 (23–71) | $3,273 ($2,773–$3,273) | 0 |
| Yurt (DIY) on day 30 | Real | 1 | 75 (74–75) | 0/9 | 0 | $1,942 ($1,163–$2,136) | $1,942 ($1,163–$2,136) | 5 (3–10) | 13.2% (10.3%–14.2%) | 0 | 0 / 88 (88–88) | 126 (126–126) | 35 (23–72) | $3,273 ($2,773–$3,273) | 0 |
| Yurt on day 30; retire starter tent after completion | Standard | 2 (1–4) | 75 (74–75) | 0/3 | 0 | $2,001 ($1,492–$2,162) | $2,001 ($1,492–$2,162) | 5 (4–5) | 13.3% (11.6%–14.2%) | 0 | 0 / 88 (88–88) | 126 (126–126) | 35 (23–71) | $3,273 ($2,773–$3,273) | 0 |
| Yurt on day 30; retire starter tent after completion | Real | 2 (1–4) | 75 (74–75) | 0/9 | 0 | $1,960 ($1,163–$2,162) | $1,960 ($1,163–$2,162) | 5 (3–10) | 13.2% (10.3%–14.2%) | 0 | 0 / 88 (88–88) | 126 (126–126) | 35 (23–72) | $3,273 ($2,773–$3,273) | 0 |

## storage: Is water the intended first bottleneck, and is that discoverable?

| Variant | Weather | short | min WB | left | away | cash end | cash low | pantry | grown | jobs h | wk1 jobs | build h | heater | gifts | missed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Tutorial order, no added storage | Standard | 1 | 75 (74–75) | 0/3 | 0 | $8,000 ($7,492–$8,163) | $8,000 ($7,492–$8,163) | 5 (4–5) | 13.4% (11.6%–14.2%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (23–72) | $3,273 ($2,773–$3,273) | 0 |
| Tutorial order, no added storage | Real | 1 | 75 (74–75) | 0/9 | 0 | $7,944 ($7,163–$8,138) | $7,944 ($7,163–$8,138) | 5 (3–10) | 13.2% (10.3%–14.2%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (23–72) | $3,273 ($2,773–$3,273) | 0 |
| 550 gal cistern (DIY) on day 0, before crops | Standard | 1 | 75 (74–75) | 0/3 | 0 | $7,524 ($6,992–$7,663) | $7,524 ($6,992–$7,663) | 5 (4–5) | 13.4% (11.6%–14.1%) | 0 | 0 / 88 (88–88) | 100 (100–100) | 36 (23–72) | $3,273 ($2,773–$3,273) | 0 |
| 550 gal cistern (DIY) on day 0, before crops | Real | 1 | 75 (74–75) | 0/9 | 0 | $7,444 ($6,663–$7,638) | $7,444 ($6,663–$7,638) | 5 (3–10) | 13.2% (10.3%–14.1%) | 0 | 0 / 88 (88–88) | 100 (100–100) | 36 (23–72) | $3,273 ($2,773–$3,273) | 0 |
| Same cistern on day 90, after crops | Standard | 1 | 75 (74–75) | 0/3 | 0 | $7,500 ($6,992–$7,663) | $7,500 ($6,992–$7,663) | 5 (4–5) | 13.4% (11.6%–14.2%) | 0 | 0 / 88 (88–88) | 100 (100–100) | 35 (23–72) | $3,273 ($2,773–$3,273) | 0 |
| Same cistern on day 90, after crops | Real | 1 | 75 (74–75) | 0/9 | 0 | $7,444 ($6,663–$7,638) | $7,444 ($6,663–$7,638) | 5 (3–10) | 13.2% (10.3%–14.2%) | 0 | 0 / 88 (88–88) | 100 (100–100) | 35 (23–72) | $3,273 ($2,773–$3,273) | 0 |

## winter: Is the warning lead time sufficient for real construction ETAs?

| Variant | Weather | short | min WB | left | away | cash end | cash low | pantry | grown | jobs h | wk1 jobs | build h | heater | gifts | missed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Winter steps when the tutorial reaches them | Standard | 1 | 75 (74–75) | 0/3 | 0 | $8,000 ($7,492–$8,163) | $8,000 ($7,492–$8,163) | 5 (4–5) | 13.4% (11.6%–14.2%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (23–72) | $3,273 ($2,773–$3,273) | 0 |
| Winter steps when the tutorial reaches them | Real | 1 | 75 (74–75) | 0/9 | 0 | $7,944 ($7,163–$8,138) | $7,944 ($7,163–$8,138) | 5 (3–10) | 13.2% (10.3%–14.2%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 35 (23–72) | $3,273 ($2,773–$3,273) | 0 |
| Heater, wood rule and order 60 days before first cold | Standard | 1 | 75 (74–75) | 0/3 | 0 | $7,550 ($7,438–$7,937) | $7,550 ($7,438–$7,937) | 5 (5–9) | 12.7% (11.2%–13.6%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 157 (95–202) | $2,773 ($2,773–$3,273) | 0 |
| Heater, wood rule and order 60 days before first cold | Real | 1 | 75 (74–75) | 0/9 | 0 | $7,462 ($6,751–$7,937) | $7,462 ($6,751–$7,937) | 5 (3–9) | 12.6% (9.9%–13.6%) | 0 | 0 / 88 (88–88) | 89 (89–90) | 157 (95–202) | $2,773 ($2,773–$3,273) | 0 |
| The same 7 days before first cold | Standard | 2 (1–26) | 74 (0–75) | 1/3 | 0 (0–15) | $7,605 ($7,284–$7,902) | $7,605 ($7,284–$7,902) | 7 (5–8) | 12.6% (11.2%–13.5%) | 0 | 0 / 88 (88–88) | 90 (89–90) | 209 (174–254) | $2,773 | 0 |
| The same 7 days before first cold | Real | 2 (1–27) | 74 (0–75) | 1/9 | 0 (0–15) | $7,595 ($6,809–$7,902) | $7,595 ($6,809–$7,902) | 5 (3–8) | 12.4% (9.6%–13.5%) | 0 | 0 / 88 (88–88) | 90 (89–90) | 209 (161–254) | $2,773 | 0 |

## rescue: Does recovery have a reasonable price and duration?

| Variant | Weather | short | min WB | left | away | cash end | cash low | pantry | grown | jobs h | wk1 jobs | build h | heater | gifts | missed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Late heater built by household labor | Standard | 2 (1–26) | 74 (0–75) | 1/3 | 0 (0–15) | $7,605 ($7,284–$7,902) | $7,605 ($7,284–$7,902) | 7 (5–8) | 12.6% (11.2%–13.5%) | 0 | 0 / 88 (88–88) | 90 (89–90) | 209 (174–254) | $2,773 | 0 |
| Late heater built by household labor | Real | 2 (1–27) | 74 (0–75) | 1/9 | 0 (0–15) | $7,595 ($6,809–$7,902) | $7,595 ($6,809–$7,902) | 5 (3–8) | 12.4% (9.6%–13.5%) | 0 | 0 / 88 (88–88) | 90 (89–90) | 209 (161–254) | $2,773 | 0 |
| Late heater with a paid crew booked the same day | Standard | 2 (1–34) | 74 (0–75) | 1/3 | 0 (0–15) | $6,501 ($6,406–$7,002) | $6,501 ($6,406–$7,002) | 7 (5–8) | 12.6% (11.1%–13.5%) | 0 | 0 / 88 (88–88) | 33 (33–33) | 210 (148–255) | $2,773 | 0 |
| Late heater with a paid crew booked the same day | Real | 2 (1–26) | 74 (2–75) | 0/9 | 0 | $6,502 ($5,823–$7,002) | $6,502 ($5,823–$7,002) | 5 (3–9) | 12.4% (9.7%–13.5%) | 0 | 0 / 88 (88–88) | 33 (33–33) | 210 (148–255) | $2,773 | 0 |

## stacking: Are per-person employment and labor limits enforced?

| Variant | Weather | short | min WB | left | away | cash end | cash low | pantry | grown | jobs h | wk1 jobs | build h | heater | gifts | missed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| One remote job | Standard | 1 | 75 (74–75) | 0/3 | 0 | $58,624 ($57,973–$58,932) | $16,000 | 5 (4–5) | 13.2% (11.5%–14.1%) | 2019 (2018–2038) | 33 (32–33) / 88 (88–88) | 89 (89–89) | 42 (33–77) | $3,273 ($2,773–$3,273) | 0 |
| One remote job | Real | 1 | 75 (74–75) | 0/9 | 0 | $58,523 ($57,186–$58,945) | $16,000 | 5 (3–9) | 13.1% (10.2%–14.1%) | 2016 (1994–2038) | 32 (32–33) / 88 (88–88) | 89 (89–89) | 43 (33–77) | $3,273 ($2,773–$3,273) | 0 |
| Three remote jobs for two adults | Standard | 1 | 75 (74–75) | 0/3 | 0 | $79,743 ($74,877–$81,596) | $16,000 | 8 (3–9) | 12.9% (11.0%–13.9%) | 2896 (2674–2944) | 50 (49–53) / 88 (88–88) | 89 (89–89) | 57 (54–70) | $3,273 ($2,773–$3,273) | 0 |
| Three remote jobs for two adults | Real | 1 | 75 (74–75) | 0/9 | 0 | $78,717 ($73,294–$81,463) | $16,000 | 8 (3–10) | 12.7% (9.8%–13.9%) | 2852 (2604–2939) | 49 (49–53) / 88 (88–88) | 89 (89–89) | 59 (51–71) | $3,273 ($2,773–$3,273) | 0 |

## Winter save rescue (recorded day-240 save, front range, zero resident labor, 90 days)

| Action | Prepaid | Home on day | Left again | Home at day 90 | Cash at day 90 | Lowest cash |
|---|---|---|---|---|---|---|
| Do nothing (zero resident labor) | $0 | — | no | no | $10,799 | $10,799 |
| Emergency construction only | $0 | — | no | no | $10,799 | $10,799 |
| Recovery route (crews, upkeep first, orders) | $1,207 | 1 | no | yes | $20,126 | $9,622 |
