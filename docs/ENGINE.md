# Engine

`packages/engine` is pure TypeScript: no React, PixiJS, DOM, `Math.random()`, or `Date.now()` (ESLint enforces this, and `test/purity.test.ts` proves the rule fires). It has two modes over one catalog:

- **Balance mode** answers "on average, does this design cover a household?" It is the spreadsheet's math and must reproduce the spreadsheet exactly.
- **Time mode** answers "does it actually work in February of a dry year?" (see the time section below).

## Provenance

Every number the engine returns is an `Explained`:

```ts
interface Explained { value: number; explain: Explain }
interface Explain {
  formula: string;                 // plain language
  terms: Term[];                   // flow-level contributions, spreadsheet row order
  refs?: Record<string, number>;   // named intermediates (provided, needed, …)
  assumptions?: AssumptionKey[];   // site values this number depends on
  notes?: string[];
}
interface Term { flowId; systemId; count; qty; period; factor; needFactor?; value }
```

Provenance is built while computing, never reconstructed afterwards. For any checklist cell, `Σ term.qty × term.factor × term.count × (term.needFactor ?? 1)` equals the value (tested).

## Balance mode

```ts
balance(catalog, assumptions, design: { counts: Record<SystemId, number> }): BalanceResult
```

### Quantities and periods

- `evalQty(flow, system, assumptions)` evaluates the flow's `QtyExpr` (see `docs/CATALOG.md`) in the spreadsheet's left-to-right order, e.g. heat load = `((area × loss-factor × HDD) × 24) ÷ 52`.
- `weeklyEquivalent(qty, period)` = `qty × timesPerYear ÷ 52`. `Per season` uses *Growing seasons per year*; `One-time` is 0; `Capacity` is 1.

### Formulas (each mirrors a spreadsheet column)

| Output | Formula | Sheet |
|---|---|---|
| Flow weekly total | `(qty × weekly factor) × count` | Flows!J |
| Contribution to need | `weekly total × Resources factor` | Flows!L |
| Resource produced / consumed | `Σ weekly totals` of output / input flows | Resources!I, J |
| Resource net | `produced − consumed` | Resources!K |
| Resource status | Ambient → Site-supplied; both 0 → Not in design; `net < −0.0001·max(consumed,1)` → Deficit; `net > 0.0001·max(produced,1)` → Surplus; else Balanced | Resources!L |
| Checklist provided / needed | `Σ contributions` of output / input flows whose resource feeds the row | Needs Checklist!C, D |
| % covered | `needed = 0 ? 0 : min(1, provided ÷ needed)` | Needs Checklist!E |
| Covered? | `needed = 0 ? n/a : % ≥ 1 ? ✓ : ✗` | Needs Checklist!F |
| Overall score | mean % over rows with `needed > 0` (0 if none) | Needs Checklist!B3 |
| Systems placed | `Σ counts − humans − Σ counts of zero-footprint systems whose category is exactly Land` | Design Summary!B6 |
| Costs, setup labor, land used | `Σ per-system value × count` (cheapest = min(buy, DIY), buy if no DIY) | B8-B10, B14 |
| Labor available / required | checklist Labor row provided / needed | B11-B12 |
| Land available; water, battery, food storage; capital in/out; wellbeing | Σ weekly totals of the named resource's outputs (inputs for capital out) | B13, B16, B18, B20-B22, B24 |
| Days of water | `water storage ÷ ((Water need + Drinking water need) ÷ 7)`, 0 if no need | B17 |
| Days of battery | `battery kWh ÷ (Electricity need ÷ 7)`, 0 if no need | B19 |
| Resources in deficit | count of status = Deficit | B25 |

Sums walk flows in spreadsheet row order (system by system; the exporter's row order is system-contiguous, and the engine falls back to sorting terms by row if it is not) so floating-point sums follow `SUMIFS`.

### Parity contract

`test/parity.test.ts` runs `balance` on the counts saved in the xlsx (`goldens.json`) and asserts every per-flow quantity and weekly equivalent, every checklist cell, the overall score, every Design Summary metric, and every Resources balance row within 1e-9 relative (absolute floor 1e-9). A parity failure is an engine bug by definition; never edit the golden.

Handoff numbers for the starter design: overall score 48.5%, Heated shelter need 697,846 BTU/wk, Food 4,979 of 16,000 kcal/wk.

### Regression digests

`designs/` holds four designs (`starter`, `offgrid-cabin-family`, `suburban-baseline`, `tent-and-nothing`). `test/balance-designs.test.ts` hashes each balance result (values only, 12 significant digits, FNV-1a 64) against `test/digests.json`. After an intended change, rerun with `UPDATE_DIGESTS=1` and record why in the build log.

### Performance

1,000 balance calls on a 200-instance design: ~75-110 ms in Node (budget 200 ms). Per-catalog lookups (flows by system, formula strings, frozen results for untouched resources) are cached in a `WeakMap` keyed by the catalog object.

## Time mode

Time mode is the game: a daily clock with stocks, storage limits, seasons, curtailment, construction, and people whose health depends on what the design delivers. It lives in `packages/engine/src/time/` and is pure: every function takes a state and returns a new one.

```ts
initGame(catalog, site, settings, seed): GameState
canPlace(catalog, state, systemId, x, y): { ok: true } | { ok: false; reason; blockers }
placeSystem(catalog, state, systemId, x, y, buildMode: 'buy' | 'diy' | 'prebuilt'): { state, instanceId }
moveSystem(catalog, state, instanceId, x, y) / removeSystem(state, instanceId) / setPriority(state, instanceId, tier)
placeDesign(catalog, state, counts, buildMode?)   // lay out a balance-mode design (tests, CLI, starter kits)
stepDay(state, catalog): { state, events, ledger }
stepDays(state, catalog, n): { state, events, ledgers }
summarizeLedgers(ledgers, catalog): Summary     // or summarize(state, catalog, { from, to })
```

The catalog is passed explicitly rather than stored in the state, so a save stays small and the same state can be replayed against an edited catalog.

### State

`GameState` is plain JSON (no Maps, Sets, or classes) so saves are trivial:

| Field | Meaning |
|---|---|
| `calendar` | `{ day (0-364), year (0-based), absDay }` on a 365-day engine calendar. Display seasons are the UI's job. |
| `rng` | 32-bit integer state of the seeded generator (mulberry32). Only the engine advances it. |
| `cash` | Dollars. The Capital stock. |
| `stocks` | Amount on hand for every Flow resource, in its canonical unit. |
| `direct` | Yesterday's output usable today by daytime loads without storage (electricity from panels). |
| `services` | Yesterday's total output of each Service resource (pollination, pest control), the supply for boosts. |
| `instances` | `{ id, systemId, x, y, status: 'building' \| 'active', buildMode, paid, setupHoursNeeded, setupHoursDone, materialsDrawn, activeSince, priority, person? }`. Instances are copied only when they change, so a quiet day allocates almost nothing. |
| `lastDay` | Yesterday's result per group (`systemId\|priority`): satisfaction, the limiting input, boost multiplier, per-instance inputs requested/received, and outputs per instance at full maturity. Cards and the flow overlay read this. |
| `weather` | The current day's ambient values. |
| `ledgers` | The last 730 daily ledgers (below). |
| `settings` | Parcel size, starting cash, weather mode, construction share, and so on. |

### Site and climate

A site (`data/sites/*.json`) gives scalar assumptions (the same keys as the spreadsheet's Assumptions sheet) and 12 monthly *shapes* for HDD, CDD, peak sun hours, precipitation, and a wind capacity-factor multiplier. The engine rescales the shapes so annual totals equal the scalars:

- HDD, CDD, precipitation on day *d* of month *m* = `annual × shape[m] ÷ Σ shape ÷ daysIn(m)`.
- Peak sun hours and wind CF on day *d* = `annual mean × shape[m] ÷ (day-weighted mean of shape)`.

`front-range` reproduces the spreadsheet's Assumptions exactly; `laramie-wy` and `asheville-nc` are the other presets. Average-year mode (the "80%" model) uses these values directly. Real-weather mode (the "90%" model, below) multiplies them by seeded draws.

### Flow shaping

Every recurring flow's daily amount is `weekly equivalent ÷ 7 × shape(day)`, where each shape averages exactly 1 over the year, so a year of time mode matches balance mode when nothing runs short:

| Shape | Applies to | shape(day) |
|---|---|---|
| steady | most flows | 1 |
| heating | heat-load inputs, Heat outputs, fuel for heating-only systems | day HDD ÷ (annual HDD ÷ 365) |
| cooling | cool-load inputs, Cooling outputs, power for cooling-only systems | day CDD ÷ (annual CDD ÷ 365) |
| sun | `sun` and `pv` quantities | day PSH ÷ annual mean PSH |
| rain | `rain` and `rainCapture` quantities | day precip ÷ (annual ÷ 365) |
| wind | `wind` quantities | day wind CF ÷ annual CF |
| growing-season | per-season flows; garden irrigation and weekly garden yields | 365 ÷ season days inside the season, else 0 |
| window | yearly harvests and applications | 365 ÷ window days inside weeks *start*–*end*, else 0 |

Climate-linked quantity kinds (heat load, PV, rain…) take their shape from the kind; typed constants take it from the flow's catalog `timing`.

### Daily step, in order

1. **Weather** and ambient resources for the day. An ambient resource is available if the site supplies it (`site.ambient`) or an active instance outputs it (e.g. Stream Frontage).
2. **Construction starts.** A newly placed instance draws its one-time inputs from stocks. Missing materials are brought in and recorded in the ledger as `imported` (the game never blocks on a missing bag of soil, but it tells you).
3. **Requests.** Each active instance requests every input for today: `weekly ÷ 7 × shape`. Capacity inputs request their nominal amount.
4. **Labor.** Pool = Σ Human Being labor output today × health factor. Construction gets first call on up to `constructionShare` (default 0.6) of the pool, split across building instances in placement order. The rest is the day's Labor supply for upkeep. Buy-mode placement needs 25% of the setup hours; DIY needs 100%; prebuilt needs none.
5. **Allocation**, per resource, from the start-of-day stock (outputs arrive at the end of the day, so the step is order-independent):
   - *Flow and Money:* by priority tier (0 people, 1 animals, 2 everything else; a player can raise or lower an instance), proportional within a tier. A request for Food (kcal) is met from any food-family stock, most perishable first, converted through the Resources factor; direct requests for a food (seed potatoes) are reserved first.
   - *Direct use:* a resource with `directUseShare` (Electricity: 0.5) can serve up to that share of today's demand from yesterday's output without storage (daytime loads running off the panels). The rest of the output must fit in storage; unused direct supply is lost at day end.
   - *Capacity:* satisfaction = min(1, available ÷ required), shared by every consumer; nothing is used up. Available = Σ nominal capacity outputs of active instances.
   - *Service (boost):* the same share rule, with available = Σ yesterday's actual service outputs.
   - *Ambient:* 1 if available, else 0.
6. **Production.** An instance's satisfaction is the minimum over its `required`, `capacity`, and `ambient` inputs (Leontief). It consumes only `satisfaction × request` of each required input and returns the rest to stock. `need` inputs (people, shelter heat and cooling) consume what they are given and never curtail output. Outputs = `daily nominal × satisfaction × Π(1 − w × (1 − boost satisfaction)) × maturity(age)`, with `maturity = min(1, age ÷ yearsToFullOutput)`. Human Being outputs scale by health instead.
7. **People.** Each Human Being tracks the fraction of food, drinking water, heat (the household's delivered ÷ needed shelter heat), and shelter it received over a rolling 7 days. Health = `max(0.3, 1 − Σ weight × (1 − 7-day average))` with weights food 0.35, drinking water 0.45, heat 0.25, shelter 0.20. A hardship event fires when a need stays below 80% for 3 days in a row, and again every 7 days it persists.
8. **Storage and loss**, at the end of the day:
   - Non-storable resources (Heat, Cooling, Cooking fuel, Transportation, Sanitation, Labor) that went unused are lost (`spilled`).
   - Production is added to stocks.
   - Pooled stocks are capped by their storage (Water storage + 50 gal; Battery storage + 0; Food storage + 10 cu ft pantry). Overflow is `spilled`, shared across the pool's resources in proportion to volume.
   - Perishables spoil at `spoilPerWeek ÷ 7` a day. The share of food that fits in real food storage (cellar, freezer; not the pantry buffer) spoils 80% slower.
9. **Money.** Capital outputs add to cash; Capital inputs were allocated from cash in step 5, so a design with no cash curtails its Capital-dependent systems. Placement can push cash below zero (debt); nothing that needs cash runs until it recovers.
10. **Ledger and events.** The day's ledger records, per resource, `start, produced, consumed, spilled, spoiled, requested, unmet`, per checklist row `provided, needed, delivered` (in row units), cash in and out, and labor. Events: `shortage` (first day a resource goes short, naming the curtailed instances), `shortage-ended`, `spill` (first day of electricity spill), `spoilage` (weekly total), `harvest`, `built`, `hardship`, `health`.

Conservation holds for every storable resource, every day: `start + produced − consumed − spilled − spoiled = end` (tested to 1e-9).

### Constants

| Constant | Value | Where |
|---|---|---|
| Buy setup fraction | 0.25 | `time/constants.ts` |
| DIY setup fraction | 1.0 | |
| Construction share of labor | 0.6 (setting) | |
| Refund on removal | 25% of what was paid if built, 100% if still building | |
| Health weights | food 0.35, drinking water 0.45, heat 0.25, shelter 0.20 | |
| Health floor | 0.3 | |
| Hardship | below 80% for 3+ days; repeats every 7 days | |
| Cold-storage spoilage cut | 80% for the stored share | |
| Boost weight (default) | 0.15 | catalog default rule |
| Arrival supplies | 28,000 kcal Food, 20 gal Drinking water, 100 gal Water (setting) | |

### Groups

Active instances of the same system at the same priority make identical requests and receive identical shares, so each day is computed once per group (system × priority). Only maturity (plants) and health (people) are applied per instance. This is what keeps a 200-instance year fast.

### Balance agreement

Two tests in `test/time-invariants.test.ts` compare year 2 of time mode (front-range, average year, everything prebuilt) with balance mode:

1. **With every input supplied** (`settings.unlimitedSupply`: requests always met, shortfalls recorded as `supplied`, no storage caps), provided and needed agree within 5% on every row for the starter, off-grid cabin, and suburban designs; in practice they agree to 0.00%, which shows the seasonal shapes preserve annual totals.
2. **With real supply**, the starter design's needed column agrees on every row, and six rows' provided column differs by more than 5%. Each difference is a curtailment chain the balance sheet cannot see (it assumes every system runs at its rated flow), and the test checks each cause:

| Row | Time vs balance | Why |
|---|---|---|
| Water | 0 vs 1,000 gal/wk | The Well needs 3 kWh/wk. One panel with no battery gives only daytime power, and people (tier 0) use it first, so the Well (tier 2) never runs. Raising the Well's priority or adding a battery fixes it. |
| Food | ~350 vs 4,979 kcal/wk | With no water, the hens and the raised beds are curtailed (Leontief on Water). |
| Sanitation | ~3 vs 35 lbs/wk | The Composting Outhouse needs Carbon (cover material) and nothing in the design makes any. |
| Transportation | 0 vs 50 mi/wk | The Cargo Bike needs its rider's calories (2,000 kcal/wk of Food); the household eats first. |
| Cooled shelter | ~16 vs 10,000 BTU/wk | The Poplar's shade cooling needs summer water. |
| Est. Required Labor | 15 vs 50 h/wk | With no drinking water, heat, or food, health falls to the 0.3 floor and labor with it. |

Electricity's provided column agrees (14 kWh/wk); only its delivery is storage-limited (29% of need vs 58% in balance mode). Heated shelter, Drinking water, Cooking fuel, and Shelter agree.

### Performance

One simulated year of a 196-instance design: ~40-55 ms in plain Node (budget 150 ms). The test bundles `bench/year.ts` with esbuild and times it in a child Node process, so the test runner's module transform is not in the measurement. Splitting the daily step into one function per phase matters: as a single 500-line function V8's optimizing compiler gave up on it and a year took ~140 ms.

### Known simplifications

- One allocation pass. An instance that is short of one input returns the unused share of its other inputs to stock, but that returned stock is not re-offered to other consumers until tomorrow.
- A day-long buffer is the only battery model: electricity produced today is usable tomorrow up to battery capacity. With no battery, daytime loads can still use up to half their demand directly (`directUseShare` 0.5) and the rest spills. Within-day timing (solar noon vs. night load) is not modeled.
- Input requests are not reduced for immature plants.

## Saves and replay

Every design change in the app goes through one engine function, `applyAction(catalog, state, action)`, and is appended to an action log with the absolute day it happened on:

```ts
type Action = { at: number } & (
  | { kind: 'place'; systemId; x; y; mode; id }   | { kind: 'remove'; id }
  | { kind: 'move'; id; x; y }                      | { kind: 'moveMany'; moves }
  | { kind: 'priority'; id; priority }              | { kind: 'settings'; settings }
  | { kind: 'insert'; instance; cashDelta; index? } | { kind: 'delete'; id; cashDelta });
```

Undo and redo are logged as the `insert` / `delete` / `moveMany` / `priority` / `settings` actions they perform, so replay never needs the undo stack. `replay(catalog, init, actions, untilAbsDay)` starts a game from `{ siteId, seed, settings }`, steps days between actions, and applies each on its day. `gameDigest(state)` fingerprints calendar, cash, RNG, stocks, instances, and settings.

A `.homestead.json` save (`homestead.save.v1`) holds the init, the action log, the day, the digest, a state snapshot for fast loading, the engine version, and the catalog's sha256. Loading replays the log and compares digests: a match is "Replay verified"; a mismatch (for example after the catalog changed) falls back to the snapshot and says so. In real weather the digest also covers `weatherLog`, every year's draws.

**Damaged saves (G10).** `saveProblems(file, catalog)` lists everything wrong with a file in plain language (not a save, missing fields, an unreadable snapshot with no date, stocks, site, or ledgers, systems the catalog no longer has); `validateSave` throws a `SaveError` carrying that list. The app never replaces the running game with a file that fails these checks: it shows the list and offers the newest autosave that passes them. It keeps two autosaves (`autosave`, and `autosave-prev`, which is only overwritten by an autosave that itself passes the checks), so one damaged autosave always leaves a good one behind.

## Reports and root causes

`buildReport(state, catalog, 'season' | 'year', ledgers, title)` summarizes a range: coverage by month per checklist row, the top three shortages, cash in / out / purchases / refunds, labor hours by system (the ledger records upkeep hours per system each day), construction hours, spoilage, spilled power, and average health.

Each shortage gets a root-cause chain from `rootCauseChain`: start at the system most often curtailed by the short resource (or, for needs that never curtail, the system that asked for it), then walk upstream: among the resource's producers in the design, find one that was itself mostly limited by something (≥25% of days) and recurse. The chain ends at a terminal cause:

- nothing in the design makes the resource;
- the producers' output is seasonal and this range is ≥15% below their annual average ("500W Photovoltaic Panels produces 42% less Electricity in winter");
- more than 20% of what was made spilled for lack of storage;
- otherwise, the producers simply make too little.

`suggestFixes` lists catalog systems that make the resource and that the player can afford, cheapest per unit of weekly output, with what else each needs.

## Space (G7)

`computeSpatial(catalog, state)` turns the catalog's spatial rules (see `docs/CATALOG.md`) into per-instance effects: input and output multipliers, `require` gates, and assigned-capacity links, each with a plain-language note. It is cached on a key of positions, status, links, and scale. Instances with identical effects share a group, so the daily step stays fast.

- **Time mode:** requests × input multipliers; outputs (and capacity provided) × output multipliers; a boost with no source in range gets 0; an assigned capacity is satisfied by the linked provider's share, not the pool. Buildings still under construction project and provide nothing.
- **Balance mode:** `designBalance` passes each system's average multiplier as `design.adjust`; matching flow terms carry `adjust` and the row's provenance lists the reasons ("Shade trees within 30 ft … In range: Oak Tree (i8)"). Spreadsheet parity uses no adjustments and is unchanged.
- **Household scale:** an instance's `scale` (children 0.6) multiplies its requests, outputs, and labor.
- **Links:** `setLink` / action `link` choose a provider for an assigned capacity (undoable).


## Real weather (G9)

`settings.weatherMode: 'real'` draws one set of values per game year from the game's seeded RNG (`drawYearWeather` in `time/weather.ts`; every constant is in `REAL_WEATHER`). Average mode draws nothing, so its games, digests, and RNG state are unchanged.

| Draw | Distribution | Effect |
|---|---|---|
| Precipitation | Lognormal, mean 1, CV 0.25 on arid sites (< 20 in/yr, e.g. Laramie), 0.15 otherwise (Box-Muller from two uniforms) | Every day's precipitation × the multiplier (rain catchment, ponds, swales, pasture). Tagged "dry year" below 0.8 and "wet year" above 1.2 |
| Degree days | u ~ Uniform(−1, 1); HDD × (1 − 0.08u), CDD × (1 + 0.08u) | A warm year needs less heat and more cooling, within ±8% |
| Late frost | 30% of years; 21–30 days (uniform integer) | The growing season starts that many days late ("last frost (N days late)"); growing-season flows are zero until then |
| Heat waves | 0, 1, or 2 per summer with probabilities 0.5 / 0.35 / 0.15; 5–10 days each, starting June 1 – August 31, not overlapping | Each day's CDD becomes base × 2 + 6 |
| Hail | 15% of years; a day inside the (possibly shortened) growing season | Growing-season flows × 0 for 7 days (`DayWeather.growMult`): a week of garden output lost |

Each year always consumes exactly 12 RNG values, whatever happens, so one outcome never shifts the draws of the next. The year's draws live in `state.yearWeather`, and every year's are appended to `state.weatherLog`, which is part of the save's state snapshot and of `gameDigest` (so an imported real-weather save is checked against its replayed weather). Sun hours and wind are not varied (the roadmap names no distribution for them).

`Math.log`, `cos`, `exp`, and `sqrt` are used for the draws. The app, its workers, and the CLI all run on V8, so results agree to the bit; another JavaScript engine could differ in the last digit.

## Monte Carlo (G9)

`monteCarloRun(catalog, spec, k)` builds the design (`gameFromDesign`: prebuilt and mature, at the layout's exact positions when the design file has one, else laid out automatically on 5 acres), runs it for `spec.years` years in real weather with seed `baseSeed + k`, and records per checklist row the lowest 7-day coverage over the run (non-overlapping weeks, as `summarizeLedgers`), the number of months with any hardship event, each year's overall score, and each year's precipitation multiplier.

`aggregateMonteCarlo(spec, runs)` turns runs (in seed order) into per-row min / P10 / median / P90 / mean (linear-interpolated quantiles) and a 10-bin histogram, the share of runs with any hardship month, hardship months per year, mean and P10 of yearly scores, and a digest of all of it. `monteCarloTable(result)` formats the table to one decimal place; the app and the CLI both print those strings.

- **CLI:** `npm run sim -- montecarlo designs/x.json --site laramie-wy --years 10 --seeds 200 [--seed 1] [--json out.json]`.
- **App:** Plan → Weather risk runs the layout on the map in Web Workers (up to four; seeds dealt round-robin, results put back in seed order before aggregating). It shows progress, can be cancelled (workers are terminated), and offers the exact design file and CLI command that reproduce its numbers.
- **Parity:** each seed is independent and pure, so the worker count cannot change the result. `montecarlo.test.ts` runs the CLI in a child process and compares its JSON and printed table with the engine's; `decision.spec.ts` does the same with the numbers the app shows.
- **Cost:** ~40–55 ms per simulated year for the shipped designs, so 10 years × 200 seeds is ~1.5 minutes of CPU, spread over the workers. The Quick preset (3 × 40) takes a few seconds.

## Scenarios, sensitivity, and exports (G9)

- **Design files with layouts.** `DesignFile` gains optional `parcelAcres` and `layout` (system, x, y, scale, priority, and assigned-capacity links by layout index). `designFromGame` writes one from the current game; `gameFromDesign` rebuilds it. Files without a layout behave as before.
- **Scenario compare.** `scenarioSummary(catalog, file, siteId)` is balance mode for the design with its layout's spatial effects (`designForBalance`): the checklist, overall score, purchase and cheapest cost, labor needed and available, land used, days of stored water and battery, and cash per year (capital net × 52). All `Explained`. The app pins up to three and adds each one's Monte Carlo P10 worst week beside the average year: the "80%" and "90%" views together.
- **Sensitivity.** `sensitivity(catalog, assumptions, design, 0.2)`: the overall score with each site assumption at −20% and +20%, sorted by swing (the tornado); then, for the weakest row the design provides anything for, the ten flows whose ±20% moves that row's coverage most (each flow's term in the row's provided or needed sum, varied alone).
- **Ledger additions.** `DayLedger.bought` is Flow output from systems that buy from outside (a Conventional system with a Capital input: grid power, city water, groceries), and `DayLedger.hardships` counts people entering hardship that day. Neither changes any existing summary or digest.
- **Flow record** (`homestead.flow_record.v1`, `flowRecord` / `flowRecords`): per game year, land by use (footprint by first category), monthly electricity bought / made on site / spilled (no net metering is modeled, so "export" is surplus with nowhere to go) / peak single-day demand / unmet, water drawn (all Water produced) vs used up (Water consumed − Greywater produced), food grown vs bought vs eaten (kcal), fuel used by type (Propane, Gasoline, Woody biomass, Wood pellets, Wood chips), spending, cash, labor, and the months anyone entered hardship. CLI: `run … --flow-record records.json`.
- **Daily CSV** (`ledgersCsv`): one row per day with health, cash, labor, weather, each checklist row's needed and delivered, and stock / produced / consumed / unmet for every flow resource that moved. CLI: `run … --csv ledgers.csv`.
- **Map PNG** is the app's (`MapScene.snapshotPng`).
