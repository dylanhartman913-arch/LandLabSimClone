# Phase 9: LL-28 and LL-29

Implemented October 24, 2026, engine 0.10.0. Both mechanics are **opt-in** in Settings → Experimental mechanics. Neither new games nor continued saves silently enable them. This follows Phase 9's requirement to measure mechanics before changing defaults.

## LL-28: wear, repair and replacement

Physical purchased assets with positive catalog lifespan track remaining condition. People, livestock, plants, garden crops, land, external services and bulk biomass do not use the equipment lifecycle. An asset without stored condition starts at 100% when wear is first enabled, regardless of its maturity backdate.

Daily loss is `(0.25 + 0.75 × realized use + 2 × skipped upkeep share) / (365 × catalog lifespan)`. Calendar aging continues while idle; full use with all upkeep consumes one catalog lifespan; skipped upkeep accelerates loss. Output stays full at 30% or more condition, declines linearly below 30%, and reaches zero at end of life. The spatial output multiplier applies to flow, service and capacity outputs, including assigned capacities. The condition-adjusted ceiling and explanation appear in system provenance. This is deterministic wear, not random breakdowns (LL-38).

The system card shows condition, output factor and a parts/labor quote. Repair pays 20% of the catalog purchase price and queues 25% of setup hours (minimum one hour). Replacement pays the full purchase price and queues full setup labor (minimum one hour). Both stop operation until actual construction labor completes, then restore full condition. Repair preserves maturity; replacement restarts it. Parts are sunk once booked. Starting service preserves the asset's built refund rate, preventing a repair from becoming a full-price removal refund. Crew refunds still follow the existing construction rules.

Market and bills shows `purchase cost / lifespan` summed over eligible installed assets as an annual replacement allowance. It is a planning forecast, separate from actual cash spending. Turning wear off pauses both degradation and its output penalty, retaining the saved condition.

## LL-29: selling and trade

Market has explicit sale/barter orders with an amount and protected reserve. Orders run after household/system consumption and before storage/spoilage, so a sale cannot outbid today's food need. Unfilled quantities wait, including when there is no spare labor or no money for collection.

Each filled order uses 0.5 hours of spare household labor. One collection trip per day's sales uses 10 remaining transport miles or charges $25; collection must be affordable before selling. Sales receive 50% of reference retail. An active Farm Stand whose previous operation met its staffing and transport inputs raises that to 80%; a stand below the full-output condition threshold cannot grant the premium while wear is enabled. Existing purchase trips and sale collection are charged separately.

Farm Stand is S178 in the source workbook, added through `scripts/catalog_patch.py`: $200 buy / $100 DIY, four setup hours, two labor hours and ten transport miles per week, 16 square feet, ten-year life. Prices and rates are experimental game balance assumptions, labeled low confidence, not researched local business estimates. Workbook parity and existing typed cells are verified in [the patch diff](catalog_patches/ll29-farm-stand-diff.md).

Eggs, honey, wool, root crops and mixed garden produce have sales reference prices in catalog overrides. They remain unavailable to purchase. Existing priced storable flows can also be sold. Resource selectors show canonical units.

Ruth barters after the tutorial actually completes; skipping it does not unlock barter. She exchanges goods at 70% of their reference retail value for available market supplies, with the same reserve and labor rule and no cash or collection charge. Received goods enter stock as external purchases; they do not become home-grown production. There is no relationship progression, finite neighbor inventory or CSA subscription in these tickets.

Sales have their own resource-ledger `sold` amount and daily `trades` receipts. They are never counted as food eaten. Cash receipts, collection costs, labor, stock removed, barter deliveries and pending orders are recorded deterministically. Repair, replacement and trade actions replay and survive JSON save/continuation.

## Measurement and rollout

[Controlled comparisons](PHASE_9_COMPARISONS.md) include 48 first-year runs (three sites; Standard seed 1 and Real seeds 1–3; baseline, wear, trade, trade plus stand), plus 12 focused checks of harvest sales and an already-worn panel.

The first-year route has no excess above the policy's conservative 28-day reserve, so its trade variants make no sales; buying and operating a stand reduces cash without benefit. This result does not establish a profitable farm business. The focused identical 300 lb honey sale earns $1,200 through the market versus $1,920 through the stand; after its $200 purchase, the stand variant retains $520 more cash in that four-day fixture, before long-term staffing/transport costs. A repaired panel at 15% initial condition makes about twice the electricity over 30 days, at a $100 parts cost and one labor hour. None of these experiments changes defaults.

Run comparisons with `node --import tsx packages/cli/bots/phase9.ts`.

## Verification

Twelve focused engine regressions cover degradation, lost upkeep, output failure, real repair/replacement labor, affordability, removal refunds, exempt living systems, reserve enforcement, current-production conservation, blocked sales, stand premiums, tutorial gating, barter, input validation and save/replay continuation. Browser coverage opts in through Settings, queues a protected sale, checks Ruth remains locked, and books repair through the card. The screenshot at `docs/screenshots/phase-9/repair.png` was visually inspected.
