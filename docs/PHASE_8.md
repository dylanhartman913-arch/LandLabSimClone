# Phase 8 — First-year balance (LL-23 to LL-27)

October 24, 2026. Engine 0.9.0. Completes the two LL-22 follow-ups as well.

## Decisions and acceptance targets

Standard, two adults, all three sites: the remote-job route, the same tutorial actions without gifts, and a yurt replacement must stay home for 365 days, keep minimum wellbeing at least 60, finish with nonnegative cash, and miss no scheduled actions. The no-gift route receives no quest assistance. Real weather uses the existing three seeds per site. These are first-year targets; starting cash is a runway, not recurring income.

LL-24 takes the roadmap's explicit-shortfall option: disclose that the starter tent and toilet each cover roughly one adult, rather than silently enlarging the tent and its heating load. New greenfield games receive $8,000 per adult ($16,000 for the default household). The old $8,000 total and all old start resources remain available to legacy replays. Tutorial assistance stays optional and separately labeled.

Crew rates are game balance settings, not real-world wage claims: Front Range $18/h, Laramie $16/h, Asheville $15/h. Price is remaining project hours times the site's rate; the crew still works eight hours per day. Existing prepaid contracts keep their booked rate, including refunds. New rates apply when booking new contracts.

## Before and after

The full LL-10 suite ran before tuning at `dad4c03` and after the change, with three Standard sites and nine real-weather site/seed cells per variant. The current full tables are in [PHASE_4_COMPARISONS.md](PHASE_4_COMPARISONS.md).

| Outcome | Before | After |
|---|---|---|
| Remote job, Standard | Town departures in 2/3 runs | 0/3; minimum wellbeing about 75; year-end cash $57,249–$59,881 |
| Remote job, real weather | Town departures in 6/9 runs | 0/9 |
| Same actions without tutorial gifts, Standard | 3/3 departures; minimum wellbeing 0 | 0/3; minimum wellbeing about 75; year-end cash $4,538–$5,540; assistance $0 |
| Same actions without gifts, real weather | 9/9 departures | 0/9 |
| Add a yurt and keep the starter tent, Standard | 3/3 departures | 1/3 departures: Laramie still heats both shelters |
| Replace the starter tent with a yurt, Standard | New explicit comparison | 0/3 departures; minimum wellbeing about 75; year-end cash $2,306–$3,174 |
| Yurt replacement, real weather | New explicit comparison | 0/9 departures; minimum cash $2,155 |
| Late heater with a crew | $2,100; 3/3 Standard and 9/9 real-weather runs leave later | $900–$1,080; no departures, positive cash in all runs |
| Recorded winter recovery, zero resident labor | Route $2,347; returns on day 1 | Route $1,207; returns on day 1 and stays home through day 90; doing nothing and emergency construction alone still never return |
| Three remote jobs for two adults | All share upkeep labor, with no employment limit | Worked employment cannot exceed 80 hours per rolling seven days; upkeep has its own allocation |

The original additional-shelter comparisons are retained. The replacement comparison adds an explicit logged removal after the yurt finishes; it does not change shelter occupancy mechanics. Laramie's retained-tent case has cash but suffers heat hardship (about 47% heat delivered), independently of the original cash collapse. Occupancy remains LL-32.

A crew is not always useful: the late-heater comparison still has a Laramie minimum wellbeing around 15 with or without a crew. Both runs exhaust wood before the late supply order; faster construction cannot supply fuel. Work now shows the household schedule, estimated days saved, the average-climate heating deadline, and the following-day start of heat output. The recorded zero-labor winter recovery is the affordable, decisive crew case.

## LL-23 — Employment

`employmentPriority` separates paid systems' labor from upkeep. Employment defaults to priority 2, below upkeep at 1, and shares that priority with ordinary construction. It can be reprioritized or capped in Work. Work is capped at 40 hours per resident adult per week; children and residents in town do not add job capacity. All jobs may be placed, but overcommitted jobs divide the available hours and earn proportionate income. Placement explains competing work and warns when chosen priorities can displace survival upkeep.

The daily ledger records paid employment separately without double-counting labor. Work also reconciles a rolling week containing both legacy and new ledger formats after a save is continued. Unused granted employment hours can still be reused for unfinished construction and gathering under `reuseIdleLabor`.

## LL-26 — No overdraft

`cashFloor` rejects unaffordable system purchases before mutation. Market trips require enough cash for delivery plus goods; blocked one-off deliveries remain queued. A hookup that cannot pay its connection fee stops delivering that day. Running-cost requests are reallocated against cash remaining after backstop purchases and fees, closing the second route to negative cash. Floating-point roundoff within the engine epsilon is clamped at zero; a larger allocation overrun throws.

Legacy logs retain their original cash behavior. A continuation does not rewrite past balances or grant new starting cash.

## LL-27 — Source verified; no catalog change warranted

The source workbook lists the Rocket Mass Heater as **Heating**, with wood input F0324 and Heat output F0325. The exporter already assigns both heating timing. A zero-HDD summer day requests no rocket-heater fuel, and its annual demand remains the catalog weekly quantity times 365/7.

The Tiny Wood Stove is **Heating; Cooking**, and explicitly supplies **Cooking fuel; Heat** (F0328/F0329). Its wood input F0327 is steady because it supplies cooking fuel all year. Changing that input to heating timing would also stop summer cooking. This contradicts the ticket's claim that both systems unintentionally burn heating fuel in July. `git blame` and `git log` identify the heating-only/cooking distinction in the imported baseline `60fad89`, not a new change.

Regression tests now pin zero summer rocket-heater demand, HDD-shaped winter demand, annual totals at every site, and continued summer cooking from the mixed-use stove. The workbook, catalog quantities, generated catalog, and parity goldens were not changed; `catalog:check` confirms consistency.

## LL-22 — Follow-ups completed

Resize now resizes the renderer, refreshes placement feedback, updates camera transforms, and renders immediately, including when the ticker is stopped. A browser regression resizes a stopped scene and checks both the transform and placement hit coordinates.

Every UI table states its measurement window or normalization at the table: measured checklist days vs average-year forecasts; current stocks and recent measured use; bills and work hours; report dates; scenario, weather-risk and sensitivity forecast periods; and per-flow periods in explanations.

## Replay and validation

New mechanics use `employmentPriority`, `siteCrewRates`, and `cashFloor`. New games enable them; continuing a legacy save appends one settings action after verification; read-only loads do not migrate. `householdStart` is start-only and never grants cash to a continued game. Engine version bumps to 0.9.0; save schema is unchanged. Round-trip tests include all new flags.

Validation results are recorded in [BUILD_LOG.md](BUILD_LOG.md). Targeted coverage is in `packages/engine/test/phase8.test.ts`, the CLI comparison acceptance test, the expanded save round trips, and browser tests for resize, table captions, employment controls, startup cash, and crew quotes.
