# Homestead Sim Playability Roadmap (G11–G16)
## Two ways to start, a survivable first season, and a checklist that tells the truth

**Written:** 2026-10-01. **Status:** sessions with gates, continuing the G-track. Same cloud-sandbox rules as `docs/HOMESTEAD_SIM_ROADMAP.md` and `CLAUDE.md`.
**Read alongside:** `docs/BUILD_LOG.md` (G0–G10 entries), `docs/ENGINE.md`, `docs/CATALOG.md`.

**Why this roadmap exists.** First playtest feedback:

1. The difficulty curve is too steep. Following the tutorial does not keep people's wellbeing up.
2. There is one way to start. Most real people are somewhere in the middle: still working and buying groceries, but adding raised beds, a coop, solar and a battery. They need an "adapt my home" path. People who want to start from nothing need a "greenfield" path with a starter kit and stockpiles that buy time to get something generative running.
3. The Human Needs Checklist counts what systems *could* produce, not what they *do* produce. A fan with no electricity still counts as cooling.
4. It is hard to find where an input comes from (wood pellets only exist at the Farm & Feed Store, and nothing in the UI says so). Players need to click from any input to its sources, and from any output to its uses.
5. The early game needs what Timberborn and Stardew Valley have: free, easy-to-reach resources on the land (deadfall, a creek, wild greens) that let you bootstrap with labor before you have infrastructure.

**Root cause of item 3, stated plainly.** G5's handoff required the "Average year" checklist to equal balance mode exactly, and balance mode is the spreadsheet's math, which multiplies nominal outputs by counts with no input check. The parity contract was right for testing the catalog and wrong for telling players what their design delivers. G11 separates the two.

---

## Design doctrine additions

### Potential versus actual

Every output has two numbers. **Potential** is what the system makes if every input is met (the spreadsheet's number; parity still applies here). **Actual** is what it made after the engine curtailed it for missing inputs. The checklist scores **Actual**. Potential appears beside it as the "if you fix your supply chains" ceiling. The gap between them is the most useful thing on the screen.

### Conventional systems become backstops, not fixed boxes

In the adapt path, the grocery store, the power grid, city water and the gas station should fill whatever the homestead does not, at a price, instead of producing a fixed weekly amount. Then every raised bed visibly shrinks the grocery bill and every panel shrinks the power bill. That feedback loop is the adapt path's whole game.

### Bootstrapping comes from the land and from stockpiles

Early survival should never depend on systems the player has not learned yet. Three things carry a new homestead:

- **Starting stockpiles:** inventory that runs down (canned food, bottled water, a stack of firewood). Finite on purpose.
- **Natural resource nodes on the map:** deadfall, a creek or spring, wild greens and berries, a clay bank. Worked with labor, slow to regrow.
- **The market:** buy anything purchasable with cash, at a trip cost. Expensive compared with growing it, but always there.

### Every input has a findable source

A CI test enforces that each Flow resource used as an input has at least one non-conventional producer in the catalog, a natural node, or a market listing. The UI shows all three wherever an input appears.

### Wellbeing is forgiving early and honest over time

Survival needs (drinking water, food, shelter, warmth in the cold) matter most and fastest. Comfort needs (electricity, cooling, transport, hot water) drift wellbeing slowly. Unmet cooling on a mild day costs nothing. Penalties scale with weather and difficulty, and every daily change has a "why."

---

## Amendments to CLAUDE.md (apply in G11)

Add under Hard rules:

> 7. The checklist and every score use **actual** (realized) flows from the engine. **Potential** (nominal) flows are shown only as a labeled ceiling. Spreadsheet parity applies to potential values.
> 8. New catalog systems are added as rows in the xlsx through `scripts/catalog_patch.py` (reviewable diff, same columns and formulas as existing rows), never only in JSON or overrides.
> 9. Pacing is tested. The playtest bots in `packages/cli/bots/` must pass their gates in CI.

Add to "Read before writing code": `docs/HOMESTEAD_SIM_PLAYABILITY_ROADMAP.md`.

---

# Session G11 — Truthful Accounting

**Claude Code session prompt:**

> Read `docs/ENGINE.md`, the checklist code in `apps/web`, and `packages/engine/src/balance/`. Add a failing test first: a design with one GoSun Fan, one Bell Tent, one Human Being, and no electricity source. Today the checklist credits the fan's cooling; after this session cooling provided must be 0 and the fan must report "blocked: no Electricity."
>
> 1. **Time mode ledgers already hold realized flows** (G3 step 6). Expose `actual` and `potential` per instance, per resource, per day, with the limiting input and its satisfaction recorded when an instance is curtailed.
> 2. **Feasible balance mode.** Add `balanceFeasible(catalog, assumptions, design)` that solves the steady-state with curtailment: start every instance at satisfaction 1, then repeat (compute supply from current satisfactions; ration each Flow resource by priority tier, proportionally within tier; set each instance's satisfaction to the minimum over its required inputs) until no value changes by more than 1e-9 or 200 iterations. Satisfactions only decrease, so this converges to the largest feasible state. Capacity and ambient rules as in time mode. Record the limiting input for every curtailed instance. Keep the old function, renamed `balancePotential`; spreadsheet parity tests move to it.
> 3. **Delivery rules for comfort outputs.** Heat and Cooling count toward the checklist only when they serve an occupied shelter: through G7 adjacency (within the producer's radius) or by being part of the shelter itself. A firepit's outdoor heat and a shade sail in an empty corner count as potential only. Add `deliversTo: 'shelter' | 'any'` to resource overrides; default `shelter` for Heat and Cooling, `any` for everything else.
> 4. **Checklist UI:** columns become Need, Actual, Potential, Needed, % covered (actual ÷ needed), Covered. The modes "Average year" (now `balanceFeasible`), "This season," and "Worst week" all use actual. A row whose actual is below potential shows "N systems blocked," expanding to each blocked system, its missing input, and a "Find a source" button (G13).
> 5. **Map status badges** (Timberborn-style): each instance shows a small icon bubble when partial (yellow) or blocked (red), with the missing input's icon. Toggle with `B`. Running systems show nothing (no clutter).
> 6. **Overall score** = average of actual coverage across rows with need > 0. Show potential score in smaller text beside it.
>
> Tests: the fan case; a solar panel feeding a well feeding raised beds, with the panel removed, curtails the well, then the beds, in that order, and the checklist's water and food rows drop; spreadsheet parity still green against `balancePotential`; `balanceFeasible` equals time mode's year-2 average within 5% for the starter design.

**Handoff condition:** no checklist number anywhere in the app comes from potential flows; screenshots show the blocked-system drill-down and map badges.

---

# Session G12 — Market and Conventional Backstops

**Claude Code session prompt:**

> 1. **Market.** Add `marketPrice`, `marketUnit` and `marketAvailable` to resource overrides. Seed prices (low confidence, flag them in `docs/CATALOG.md` and propose adding them as Resources columns in the xlsx):
>
>    | Resource | Price | Note |
>    |---|---|---|
>    | Food | $0.0065 / kcal | ~$90 per 14,000 kcal week |
>    | Drinking water | $1.00 / gal | bottled |
>    | Water | $0.10 / gal | hauled delivery |
>    | Woody biomass | $0.10 / lb | ~$350 per cord |
>    | Wood pellets | $0.30 / lb | |
>    | Propane | $3.00 / gal | |
>    | Gasoline | $3.50 / gal | |
>    | Chicken feed | $0.35 / lb | |
>    | Hay | $0.15 / lb | |
>    | Carbon (straw) | $0.10 / lb | |
>    | Compost | $0.20 / lb | bagged |
>    | Soil | $1.50 / cu ft | bulk |
>    | Seeds | $3.00 / oz | |
>    | Seedlings | $4.00 / plant | |
>    | Waste lumber | $0.25 / lb | salvage yard |
>
>    Electricity is not sold at the market; it comes only through a grid connection.
> 2. **Buying.** The player can buy now (instant, from a Market panel) or set **standing orders** (e.g. "keep firewood above 500 lbs"). Each market trip consumes Transportation (10 miles per trip, one trip per day covers all orders). With no transport, delivery costs $25 per trip.
> 3. **Backstop dispatch.** Conventional systems tagged `backstop: true` in overrides (Big Box Grocery Store, Factory Farmed Food, Central Power Plant, Municipal Water Hookup, Gas Station, Farm & Feed Store, Propane Tank & Delivery) stop producing fixed amounts. Each day, after on-site production is allocated, they fill remaining demand for their resources up to a cap (their catalog weekly output × 3) at their price, paid from cash. A connection system with a fixed fee (grid hookup, city water) charges its fee whether used or not. Ledgers record backstop supply separately from on-site supply.
> 4. **Self-reliance metric.** Per checklist row: share of actual coverage that came from non-backstop, non-market sources. This becomes the adapt path's headline score (G15).
> 5. **Weekly bills panel:** what you paid this week for each backstop and market resource, with the trend over the last 12 weeks.
>
> Tests: an adapt-style design with grocery and grid backstops covers 100% of food and electricity at full price; adding four raised beds and a 6 kW array reduces grocery and grid spend by the amount those systems actually produced (to the cent); cash below zero stops all purchases and logs it.

**Handoff condition:** every Flow resource used as an input has a producer, a node, or a market listing (CI test `sources.audit.test.ts`, which also lists resources with only one source as warnings).

---

# Session G13 — Where Does This Come From?

**Claude Code session prompt:**

> **Resource pages.** Every resource gets a page (route `/resource/:name`, also a side sheet): icon, unit, class, what it means; current stock, storage limit, spoilage; 12-week produced/consumed chart; and four source lists:
> - **In your design:** instances producing it, with actual output and spare capacity.
> - **On your land:** natural nodes that yield it (G14), with distance and yield per labor hour.
> - **You could build:** catalog systems that produce it, sorted by cost per unit, each showing its own inputs with a "you have this" check.
> - **Buy:** market price and a buy button.
> The same four lists for consumers ("Where it goes"): instances using it, catalog systems that use it, sell/compost/discard options.
>
> **Click-through everywhere.** Every input row on a System Card, every checklist row, every Inputs/Outputs tab entry, and every shortage toast links to the resource page. Every system named on a resource page opens its System Card. Keep a back stack (Backspace or a back arrow) so the player can walk a supply chain and return.
>
> **Supply-chain tree.** On a System Card, "Show supply chain" expands its inputs into producers, and their inputs into producers, three levels deep, with already-satisfied branches collapsed and green. "Plan this branch" adds the needed systems to a **build plan** (ghost sprites on the map, not built, with a total cost and labor estimate). The plan can be built all at once or one piece at a time.
>
> **Search by resource.** The drawer's quick search already matches resources; add a "makes / uses" toggle so typing "wood pellets" lists the pellet mill (G15 catalog addition) and the pellet stove separately.
>
> Playwright: from a blocked pellet stove, click the missing input, see the market and the pellet mill, open the mill, see its wood-chip input, plan the branch, and screenshot each step.

**Handoff condition:** from any blocked system, a player reaches a buildable or buyable source in three clicks or fewer (e2e test walks five different blocked systems).

---

# Session G14 — The Land Provides (Gathering Layer)

**Claude Code session prompt:**

> Timberborn and Stardew start players with free, labor-gated resources on the map. Add that layer.
>
> 1. **Natural nodes** are site data (`data/sites/*.json`, new `nodes` array), not catalog systems. Each node: type, position, resource, yield per labor hour, stock, regrowth per day, season mask, optional quality flag.
>
>    | Node | Resource | Yield per labor hour | Regrowth | Notes |
>    |---|---|---|---|---|
>    | Deadfall | Woody biomass | 40 lbs | slow (refills over ~1 year) | finite early wood |
>    | Creek / spring | Water | 25 gal | unlimited unless drought | untreated: needs a filter or boiling (Cooking fuel) to become Drinking water |
>    | Wild greens | Green biomass, Vegetables fruit fiber herbs (small) | 6 lbs / 0.5 lbs | seasonal | spring and summer |
>    | Berry thicket | Vegetables fruit fiber herbs | 2 lbs | seasonal | late summer |
>    | Clay bank | Soil | 3 cu ft | unlimited | building earth for cob and ovens |
>    | Leaf litter | Carbon | 20 lbs | autumn | compost browns |
>    | Rain pools | Water | 10 gal | after rain only | the bootstrap water before a barrel exists |
>
>    Site generation scatters nodes by preset (Asheville: lots of deadfall and creek; Laramie: little wood, a spring, more wind). Drought (G9 real-weather mode) lowers creek yield.
> 2. **Gathering is a job.** People do it with labor hours, walking out to the node (the walking sprites from G4 now mean something). Travel time counts as labor: 1 minute per 50 ft each way, per trip.
> 3. **Work priorities panel** (Timberborn-style): a list of jobs (each gather type, construction, each system's upkeep, market trips) with a 1–5 priority and an optional weekly hour cap. Labor is allocated by priority, then proportionally. Defaults keep survival gathering (water, wood in cold months, food when stocks are low) at priority 1.
> 4. **Auto-gather rules:** "keep drinking water above 3 days," "keep firewood above 2 weeks of heat," "keep food above 1 week." On by default in greenfield; editable.
> 5. Map: nodes render as sprites (deadfall pile, creek line, berry bushes) that visibly deplete and regrow; hovering shows stock and yield.
>
> Tests: a greenfield household with no systems except a tent and a firepit sustains drinking water and heat from the creek and deadfall for a spring month on front-range using only auto-gather; creek yield drops in a drought year; gathering labor competes with construction labor through priorities.

**Handoff condition:** gathering appears in the "why" popovers ("Drinking water: 6 gal from creek via boiling, 2.5 hrs labor"); node depletion is visible on the map after a simulated season.

---

# Session G15 — Two Ways to Start

### The start screen

Two large cards, then site, household and difficulty:

- **Adapt your home.** "You live in a house, work a job and shop at the store. Turn your yard and roof into a homestead, one project at a time."
- **Start from the ground up.** "Raw land, a starter camp and a few weeks of supplies. Build something that feeds itself before the stockpile runs out."

Each card previews its starting kit, stockpile, cash, and land size. Difficulty presets: **Gentle** (slow wellbeing loss, generous stockpile), **Standard**, **Real weather** (G9's 90% mode, standard stockpile).

**Claude Code session prompt:**

> 1. **Start configs as data:** `data/starts/adapt.json` and `data/starts/greenfield.json`: land, prebuilt instances (already active, no construction), starting inventory, cash, auto-gather rules, tutorial ID, and per-difficulty multipliers.
> 2. **Adapt start** (suburban lot, 1/4 acre): Average Suburban Home, Average Job, Average American Vehicle, and backstop connections to Big Box Grocery, Central Power Plant, Municipal Water; household of 2; cash $15,000; 1 week of pantry food. On day 1 every checklist row is 100% covered and self-reliance is near 0%. The headline becomes **Self-reliance** (G12) and **Weekly bills**, with the off-grid score shown secondary. The job is a lever: add catalog variants (below) so the player can trade income for labor hours.
> 3. **Greenfield start** (1 acre): starter kit placed and active, sized so a household of 2 survives about 6–8 weeks at 1× with no player action in a spring start, then declines slowly rather than collapsing:
>
>    | Starter kit | Why |
>    |---|---|
>    | Canvas Wall Tent + Stove Jack | shelter that takes a stove |
>    | Tiny Wood Stove | heat and cooking from gathered wood |
>    | Firepit | backup cooking, wellbeing |
>    | 500W Photovoltaic Panels + Portable Power Station (1 kWh) | a little light and phone power |
>    | GoSun Fan | summer comfort once there is power |
>    | Drinking Water Filter | turns creek and rain water into drinking water |
>    | Rain Barrel (new, see below) | first water storage |
>    | Humanure Bucket System | sanitation from day one |
>
>    | Starting stockpile (household of 2) | Lasts about |
>    |---|---|
>    | Canned and dry food, 600,000 kcal (Food storage counted) | 3 weeks at full ration |
>    | Bottled drinking water, 40 gal | 4 weeks of drinking only |
>    | Seasoned firewood, 800 lbs | 3–4 weeks of spring nights |
>    | Seed packets, 8 oz; seed potatoes, 25 lbs | one season of beds |
>    | Sawdust (Carbon), 100 lbs | toilet cover for a season |
>    | Cash, $8,000 | a few early builds or market runs |
>
>    Start date: spring, day 1, so the first winter is ~9 months away.
> 4. **Wellbeing rework** (`docs/ENGINE.md` section "Wellbeing v2"). Per person, 0–100, start 75.
>    - Survival needs and their grace periods before any penalty: drinking water 1 day, food 4 days at under 50% (then 1 day at under 20%), shelter 2 days, heat only on days with HDD > 10 (grace 1 night), sanitation 7 days.
>    - Comfort needs drift only: electricity, cooling (only days with CDD > 5), transportation, hot water, cooking fuel (raw-food penalty is mild).
>    - Daily change = recovery (+0.6 when all survival needs are met, more with comfort coverage) − Σ weighted penalties × difficulty multiplier. Bounded per day so no single bad day costs more than 8 points.
>    - Labor output = base × (0.5 + 0.5 × wellbeing/100).
>    - At 0, the person "goes to stay in town" (leaves the household, stops consuming and producing) and can return when wellbeing conditions at home recover. No deaths.
>    - HUD shows each person's wellbeing bar and the top reason it is moving today; the "why" lists every term.
> 5. **Stockpile HUD** (Timberborn's top bar): days of food, drinking water, firewood, and battery, each with a trend arrow; red under 3 days.
> 6. **Catalog additions** via `scripts/catalog_patch.py` (rows added to the xlsx Systems and Flows sheets with the existing column formulas; the user reviews the diff in Excel before merge):
>
>    | System | Categories | Key flows | Why |
>    |---|---|---|---|
>    | Rain Barrel (55 gal) | Water-System; Storage | catchment 100 sq ft → Water; Water storage 55 | the cheap first water step |
>    | Pellet Mill (small) | Biomass; Energy | Wood chips 120 + Electricity 15 → Wood pellets 100 / week | an on-site pellet source |
>    | Part-Time Job (20 hrs) | Conventional | Labor 20 + Transportation 75 → Capital 575 / week | adapt-path lever |
>    | Remote Job (40 hrs) | Conventional | Labor 40 → Capital 1,000 / week | no commute |
>    | Sheet-Mulch Lawn Conversion (500 sq ft) | Garden | Carbon 100 + Compost 200 (one-time) → Soil 40 | turn lawn into beds |
>    | Home Weatherization Retrofit | Shelter; Heating | modifier: host shelter heat-loss factor × 0.7 | the cheapest heat source is not losing it |
>    | Suburban Lot (1/4 acre) | Land | Land area 10,890 | adapt start land |
>    | Clothesline | Tools | Labor 0.5 → Wellbeing; modifier: home electricity −2 kWh/week | small, satisfying swap |
>
>    The retrofit and clothesline need a `modifies` override (target system or category, resource, multiplier), reusing G7's adjacency-modifier machinery with radius 0 (attached to a host shelter).
>
> Tests (also the pacing gates for G16): adapt start idles at 1× for 2 years with wellbeing ≥ 70 and self-reliance < 5%; greenfield start idles at 1× in a spring start with no hardship for 28 days, wellbeing ≥ 50 at day 42, and nobody gone to town before day 60.

**Handoff condition:** both starts playable from the start screen; stockpile HUD and wellbeing "why" visible in screenshots; catalog patch reviewed (link the xlsx diff summary in the PR).

---

# Session G16 — Tutorials and Pacing Gates

**Claude Code session prompt:**

> 1. **Playtest bots** in `packages/cli/bots/`, each a deterministic policy over the engine API:
>    - `idle`: does nothing.
>    - `tutorialFollower`: completes the current quest the cheapest way the quest itself suggests, then waits.
>    - `greedy`: each week builds the cheapest catalog system that most reduces the worst checklist row.
>    - `adaptUpgrader`: adapt path, adds one project per month from the tutorial list.
> 2. **Pacing gates in CI** (run 3 seeds × 3 sites; fail the build if any gate misses):
>
>    | Start | Bot | Gate |
>    |---|---|---|
>    | Greenfield, Standard | idle | no hardship for 28 days; nobody leaves before day 60 |
>    | Greenfield, Standard | tutorialFollower | wellbeing ≥ 60 every month of year 1; at least one food row ≥ 25% actual by autumn |
>    | Greenfield, Gentle | idle | nobody leaves before day 90 |
>    | Greenfield, Real weather | tutorialFollower | survives year 1 in ≥ 2 of 3 seeds (difficulty should bite) |
>    | Adapt, Standard | adaptUpgrader | weekly bills fall ≥ 20% by end of year 1; wellbeing ≥ 70 throughout |
>
> 3. **Greenfield tutorial**, quests in order, each with a small reward from a "neighbor" (a stockpile top-up or cash) and a one-line reason:
>    1. "Fill the rain barrel and filter a day's water." (teaches water chain)
>    2. "Gather a week of firewood from the deadfall." (teaches gathering and work priorities)
>    3. "Build a raised bed and plant it." (teaches one-time inputs: soil from the clay bank or the market)
>    4. "Start a compost pile with leaf litter and kitchen scraps." (first closed loop)
>    5. "Set an auto-gather rule so you never run out of water." (automation)
>    6. "Add a chicken coop and keep the hens fed." (animals, feed sourcing via the resource page)
>    7. "Get through the first cold snap warm." (heat, shelter heat loss, the weatherization idea)
>    8. "Cover 25% of your food from the land for a month." (the milestone that the stockpile was buying time for)
> 4. **Adapt tutorial:** "Read your weekly bills," "Build two raised beds in the lawn," "Add compost," "Put a 500 W panel and a power station on the porch," "Install a rain barrel," "Weatherize the house," "Add six hens (check the lot rules)," "Cut to a part-time job and see if the homestead covers the difference."
> 5. **Quest UI:** pinned card with the goal, progress, a "show me" button that highlights the relevant drawer item, node, or resource page, and the checklist row it moves.
> 6. **Tuning loop:** if a gate fails, adjust only start configs, node yields, wellbeing constants, and quest rewards (all data), never catalog quantities. Record every tuning change and the gate results in `docs/BALANCE_LOG.md`.

**Handoff condition:** all pacing gates green in CI; a Playwright run of the first five greenfield quests with screenshots; `BALANCE_LOG.md` explains each tuned constant.

---

## Session order

| Session | Deliverable | Depends on |
|---|---|---|
| G11 | Actual vs. potential, feasible balance, blocked badges | G10 |
| G12 | Market, backstops, self-reliance, bills | G11 |
| G13 | Resource pages, click-through, supply-chain tree, build plans | G12 |
| G14 | Natural nodes, gathering, work priorities, auto-gather | G11 |
| G15 | Start screen, two starts, starter kit, stockpiles, wellbeing v2, catalog additions | G12, G14 |
| G16 | Bots, pacing gates, both tutorials | G13, G15 |

G13 and G14 can run in parallel once G12 lands.

## What to check when it comes back

- The GoSun-fan test exists and passes, and no checklist code path calls `balancePotential`.
- Spreadsheet goldens are untouched; parity tests now target `balancePotential`.
- The xlsx diff from `catalog_patch.py` adds rows only (no edited existing numbers).
- Pacing gates are real CI jobs, not skipped; `BALANCE_LOG.md` shows the numbers that were tuned and why.
- Greenfield idle at 1× in the browser: count the days until the first hardship toast. It should be at least four weeks.
