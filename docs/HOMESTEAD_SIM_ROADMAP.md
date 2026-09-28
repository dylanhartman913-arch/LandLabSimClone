# Homestead Sim Roadmap (G-Track)
## From the Systems Spreadsheet to a Playable, Decision-Grade Simulator

**Written:** 2026-09-28. **Status:** sessions with gates, for Claude Code running in a cloud sandbox against a git repo.
**Source of truth:** `data/source/LandLab_Sim_Systems_v2.xlsx` (168 systems, 797 flows, 62 resources, 24 categories).
**Read alongside:** `CLAUDE.md` (repo conventions, read at the start of every session) and `docs/BUILD_LOG.md` (what each finished session left behind).

**Purpose:** build a top-down homestead planning game in the spirit of the reference off-grid simulator, but with an engine that is honest enough to plug into a decision-support tool later. The player places systems on a patch of land; each system draws inputs and makes outputs; the Human Needs Checklist shows how much of a household's life the design covers. Unlike the reference game, flows really connect: a shortage in one place curtails the systems downstream, seasons move supply around the year, and every number can explain where it came from.

**Out of scope for this roadmap:** any coupling to TERRA. The engine is built so that coupling is easy later (pure functions, versioned schemas, a headless CLI, a flow-record export), but no session here imports TERRA code or data.

---

## Design doctrine

### The spreadsheet is the catalog; the repo never hand-edits catalog numbers

Every system, flow, resource, cost, and assumption comes from the xlsx through an exporter. If a number is wrong, fix it in the spreadsheet and re-export. Engine-only fields the spreadsheet does not have yet (input roles, maturity, harvest timing, spoilage, adjacency, sprite keys) live in one sidecar file, `data/catalog_overrides.json`, merged by the exporter. Generated JSON is committed so the app builds without the exporter, and CI fails if the committed JSON is out of sync with the xlsx.

### Two engines, one catalog

- **Balance mode** answers "on average, does this design cover a household?" It is the spreadsheet's math: weekly averages × counts. It must reproduce the spreadsheet's cached Needs Checklist values exactly. This is the parity contract.
- **Time mode** answers "does it actually work in February of a dry year?" It runs a daily clock with stocks, storage limits, seasons, curtailment, construction time, and weather. It is the game.

Both read the same catalog and share unit and period code. Balance mode is the regression test for time mode: averaged over a normal year with no shortages, time mode must land within a documented tolerance of balance mode.

### Units are data, not strings

Every resource has exactly one canonical unit (from the Resources sheet). Quantities in the engine are numbers tagged by resource; display converts (imperial/metric toggle). No field ever mixes a capacity (BTU/hr, sq ft) with an energy or amount (BTU, gal). The reference game's "1,000 BTU daily cooling" is the failure mode this rule prevents.

### Four kinds of resource, four behaviors

| Class | Examples | Engine behavior |
|---|---|---|
| Flow | Water, Food, Electricity, Compost | Produced into a stock, consumed from it. Bounded by storage where storage exists; can spoil. |
| Capacity | Shelter, Roofing area, Water storage, Fenced paddock | Occupied, not used up. Satisfaction = available ÷ required, shared. |
| Ambient | Sunlight, Rainfall, Wind, Stream flow | Set by site and weather each day. Never "in deficit." |
| Service / Money | Pollination, Pest control, Wellbeing; Capital | Services act as yield modifiers; Capital is the cash stock. |

### The player is always one click from "why"

Every displayed number (a progress bar, a checklist cell, a yield) has a "why" popover: the formula, the catalog rows it came from, the assumptions it used, and the confidence rating. This is the single feature that turns a game into a decision-support tool, and it is cheap if the engine records provenance from the start.

### Original name and art

The reference game is inspiration, not a template. Use an original working title (the repo is `homestead-sim`; pick a name before any public deploy), original sprites, and original copy. The catalog is real-world facts and estimates, which is fine to use; the reference game's pixel art, icons, logos, and card text are not.

---

## Working in the cloud sandbox (read before G0)

These notes are for Claude Code running in a fresh cloud container per session, pushing to the git repo.

1. **Every session starts cold.** Read `CLAUDE.md`, this roadmap's section for the session, and the last entry of `docs/BUILD_LOG.md` before touching code. End every session by appending a build-log entry (what shipped, digests, known gaps) and committing.
2. **One session = one branch = one PR.** Branch name `g<N>-<slug>`. Open the PR with the handoff checklist copied in and ticked. Do not merge your own PR unless the user's instructions say to.
3. **There is no screen.** Verify UI with Playwright (headless Chromium): every UI session adds or updates `tests/e2e/*.spec.ts` and saves screenshots to `docs/screenshots/<session>/`. Commit the screenshots and embed them in the PR description so the user can review the UI from their phone.
4. **Background long-running processes.** Start the dev server with `npm run dev -- --port 5173 &` and wait on the port; never block the session on a foreground server. Kill it before finishing.
5. **Assume restricted network at runtime.** `npm ci` from the lockfile at session start; no runtime CDN fetches in the app; fonts and sprites are bundled. If a package install fails, record it in the build log and pick a dependency-free alternative rather than stalling.
6. **Determinism everywhere.** Seeded RNG (integer state saved in the game file), no `Math.random()` in engine code, no `Date.now()` in engine code. Tests assert digests.
7. **CI is the gate.** GitHub Actions runs typecheck, lint, unit tests, parity tests, catalog-sync check, and Playwright smoke on every PR. A red CI is a failed session, even if the feature works locally.

---

## Target architecture

```
homestead-sim/
  CLAUDE.md
  docs/  HOMESTEAD_SIM_ROADMAP.md  BUILD_LOG.md  ENGINE.md  CATALOG.md  screenshots/
  data/
    source/LandLab_Sim_Systems_v2.xlsx      # source of truth (user edits this)
    catalog_overrides.json                   # engine-only fields, hand-maintained
    sites/*.json                             # climate presets (monthly profiles)
  packages/
    catalog/   exporter (xlsx -> JSON), zod schema, validators, generated/catalog.json, generated/goldens.json
    engine/    pure TypeScript: balance mode, time mode, allocation, provenance. Zero DOM/React imports.
    cli/       headless runner: run a design file for N years, print metrics / flow record
  apps/
    web/       Vite + React + TypeScript app; PixiJS map; Zustand store; UI components
  tests/e2e/   Playwright specs
  .github/workflows/ci.yml
```

npm workspaces. TypeScript strict everywhere. Vitest for unit/parity, Playwright for e2e. ESLint `no-restricted-imports` forbids `react`, `pixi.js`, and `apps/*` inside `packages/engine`.

---

# Phase G0 — Repository Scaffold

### Session G0 — Workspaces, CI, and Conventions

**Claude Code session prompt:**

> Read `CLAUDE.md` and this roadmap. The repo may contain only the xlsx and these docs.
>
> 1. Create the workspace layout above with npm workspaces: `packages/catalog`, `packages/engine`, `packages/cli`, `apps/web`. TypeScript strict, shared `tsconfig.base.json`, ESLint + Prettier, Vitest at the root, Playwright in `tests/e2e`.
> 2. Move the xlsx to `data/source/` if it is elsewhere. Add `data/catalog_overrides.json` as `{ "version": 1, "systems": {}, "resources": {} }`.
> 3. `apps/web`: Vite + React smoke page that renders "homestead-sim" and the engine's version string (proves the workspace link).
> 4. `.github/workflows/ci.yml`: `npm ci`, typecheck, lint, `vitest run`, `playwright install --with-deps chromium`, build web, run e2e against `vite preview`. Upload Playwright screenshots as a CI artifact.
> 5. Scripts in the root `package.json`: `dev`, `build`, `test`, `test:e2e`, `typecheck`, `lint`, `catalog:export`, `catalog:check`, `sim` (CLI).
> 6. Create `docs/BUILD_LOG.md` with a G0 entry.

**Outputs:** scaffold, green CI, smoke screenshot in `docs/screenshots/g0/`.
**Handoff condition:** fresh clone → `npm ci && npm test && npm run build && npm run test:e2e` passes in CI; engine package has an ESLint rule proving it cannot import React.

---

# Phase G1 — Catalog Exporter and Schema

### Session G1 — `packages/catalog`

**Claude Code session prompt:**

> Read every sheet of the xlsx (README, Needs Checklist, Design Summary, Systems, Flows, Resources, Matrix, Categories, Assumptions) with SheetJS (`xlsx` package), reading both formulas (`cellFormula: true`) and cached values. Write the exporter in TypeScript.
>
> 1. **Schema (zod, exported types):**
>    - `Resource { name, unit, class: 'Flow'|'Capacity'|'Ambient'|'Service'|'Money', needsRow?: NeedKey, factorToNeed?: number, note }`
>    - `System { id, name, categories: Category[], originalTags?, source, description, costBuy, costDiy?, setupLaborHrs, weeklyUpkeepHrs, footprintSqft, lifespanYrs, conditionedAreaSqft?, heatLossFactor?, catchmentSqft?, captureEff?, confidence, notes, starterCount }`
>    - `Flow { id, systemId, direction: 'in'|'out', resource, qty: QtyExpr, period: Period, note }`
>    - `QtyExpr = { kind: 'const', value } | { kind: 'sun' } | { kind: 'rain' } | { kind: 'pv', kw } | { kind: 'wind', kw } | { kind: 'hydro', kw } | { kind: 'catchArea' } | { kind: 'rainCapture' } | { kind: 'heatLoad' } | { kind: 'coolLoad' }`
>    - `Assumptions { hdd, cdd, psh, pvDerate, precipIn, galPerSqftIn, windCf, hydroCf, seasonsPerYear }` and the period table.
> 2. **Formula recognition.** Flow quantities that are formulas must match one of the known templates (regex on the formula string, e.g. `^=([\d.]+)\*Assumptions!\$C\$6\*7\*Assumptions!\$C\$7$` → `pv`). An unrecognized formula fails the export with the flow ID and formula text. Never silently fall back to the cached value.
> 3. **Validation (fail the export on any):** unknown resource in a flow; a resource used with a period incompatible with its class (Capacity must be `Capacity`; Flow must not be); duplicate system names; category not in the Categories sheet; negative quantities; Labor upkeep in Systems column K not reflected in a Labor input flow.
> 4. **Overrides merge.** Read `catalog_overrides.json` and apply defaults for fields the spreadsheet lacks (see "Engine-only fields" below). Write the effective values into `generated/catalog.json` with a `provenance` field per value: `"xlsx"`, `"override"`, or `"default-rule"`.
> 5. **Goldens.** Export the cached values of the Needs Checklist (provided, needed, %), overall score, Design Summary metrics, and Resources balance columns for the design saved in the xlsx (the "Count in design" column) into `generated/goldens.json`, together with those counts.
> 6. **Sync check.** `npm run catalog:check` re-exports to a temp dir and diffs against the committed files; CI runs it.
> 7. Write `docs/CATALOG.md`: every field, where it comes from, and how to add a system (spreadsheet row + flow rows + optional override).

**Engine-only fields (defaults the exporter applies, overridable per system/resource):**

| Field | Default rule |
|---|---|
| `inputRole` per flow | Capacity class → `capacity`; Service class → `boost` (yield modifier, weight 0.15); Ambient → `ambient`; Labor → `required`; everything else → `required` |
| `priorityTier` per system | Human Being 0; categories Livestock/Fowl/Insects 1; all others 2 |
| `yearsToFullOutput` | Plants and Biomass trees 5, food forest 7, coppice 3, everything else 0 |
| `harvest` per output with period `Yearly` | Plants: spread over weeks 34–43 (Sept–Oct); Biomass wood: weeks 44–48 |
| `seasonal` per output with period `Per season` | Spread over the site's growing-season days |
| `spoilPerWeek` per resource | Vegetables 0.10, Eggs 0.03, Milk 0.30, Meat 0.20, Fish 0.30, Mushrooms 0.25, Root crops 0.02, Grain/Nuts/Honey 0.002; others 0 |
| `storedIn` per resource | Water/Drinking water → Water storage (+ 50 gal ambient buffer); Electricity → Battery storage (no buffer: unstored surplus is spilled); food family → Food storage (+ 10 cu ft pantry). Food storage in a cellar/freezer cuts spoilage by 80% for the stored share |
| `spriteKey` | `system:<id>` with a generated placeholder until art exists |
| `adjacency` | none (added in G7) |

**Outputs:** exporter, schema, `generated/catalog.json`, `generated/goldens.json`, `docs/CATALOG.md`, validator tests.
**Handoff condition:** export of the delivered xlsx passes with 168 systems, 797 flows, 62 resources; every formula flow maps to a `QtyExpr`; `catalog:check` green in CI; a deliberately broken fixture xlsx (unknown resource, unknown formula) fails with a readable message.

---

# Phase G2 — Balance Engine and Spreadsheet Parity

### Session G2 — `packages/engine` Balance Mode

**Claude Code session prompt:**

> Implement balance mode as pure functions over `(catalog, assumptions, design)` where `design = { counts: Record<SystemId, number> }`.
>
> 1. `evalQty(flow, system, assumptions)` evaluates each `QtyExpr` exactly as the spreadsheet formulas do (see `docs/CATALOG.md`).
> 2. `weeklyEquivalent(qty, period, assumptions)` using the period table (one-time → 0; capacity → factor 1).
> 3. `balance(catalog, assumptions, design)` returns per-resource produced / consumed / net / status, the Needs Checklist (11 rows: provided, needed, %, covered), the overall score (average of rows with need > 0), and the Design Summary metrics (costs, setup labor, labor available/required, land available/used, water and battery days of autonomy, food storage, capital in/out/net, wellbeing, deficit count).
> 4. **Provenance:** every number returned carries `explain: { formula: string, terms: Array<{ flowId, systemId, count, qty, period, factor }> }`. Build it as you compute; do not reconstruct it later.
> 5. **Parity tests:** load `goldens.json`, run `balance` on its counts, and assert every checklist, summary, and resource-balance value within 1e-9 relative. A parity failure is an engine bug by definition; never edit the golden.
> 6. Add three hand-built designs as extra fixtures (off-grid cabin family of 4; suburban baseline; tent + nothing). For these, record the engine's output as a digest and commit; they guard later refactors.
> 7. `packages/cli`: `npm run sim -- balance designs/starter.json` prints the checklist as a table.

**Outputs:** balance engine, parity suite, CLI balance command, `docs/ENGINE.md` (balance section).
**Handoff condition:** starter design reproduces the spreadsheet (overall score 48.5%, Heated shelter need 697,846 BTU/wk, Food 4,979 of 16,000 kcal/wk); performance: 1,000 balance calls on a 200-instance design < 200 ms.

---

# Phase G3 — Time Engine

### Session G3 — Daily Clock, Stocks, Allocation, Seasons

This is the core of the game and the part the reference simulator lacks. Write `docs/ENGINE.md` (time section) first, get it into the PR description, then implement.

**Claude Code session prompt:**

> Implement time mode in `packages/engine/src/time/` as pure functions: `initGame(catalog, site, settings, seed)`, `placeSystem(state, systemId, x, y, buildMode)`, `removeSystem`, `stepDay(state) → { state, events }`, `stepDays(state, n)`, `summarize(state, range)`.
>
> **State** holds: calendar (day of year, year), RNG state, cash, stocks per Flow resource, per-instance records (id, systemId, position, build status, age in days, last satisfaction, player priority), weather for the current day, and rolling ledgers (daily per-resource produced/consumed/spilled/spoiled/unmet, per instance).
>
> **Site and climate.** A site file supplies monthly profiles: heating and cooling degree-days, peak sun hours, precipitation (inches), wind capacity factor multiplier, growing-season start/end day, and the scalar assumptions. Daily ambient = monthly value ÷ days in month (80% mode) or that value × a weather draw (90% mode, G9). Ship three presets: `front-range` (matches the spreadsheet's Assumptions), `laramie-wy`, `asheville-nc`.
>
> **Daily step, in order:**
> 1. Weather and ambient resources for the day.
> 2. Construction: instances under construction draw setup labor from the day's labor pool (see 4) and one-time inputs from stocks when construction starts. When setup hours are met, the instance becomes active. A buy-mode placement pays `costBuy` and needs 25% of setup hours; DIY pays `costDiy` and needs 100%.
> 3. Requests: every active instance computes today's requested inputs = weekly equivalent ÷ 7, shaped by season (heating by the day's HDD, cooling by CDD, irrigation and garden flows only inside the growing season, yearly outputs on harvest days).
> 4. Labor pool: Σ Human Being labor output today × health factor (step 7). Labor is allocated first to construction the player has queued, then by tier.
> 5. Allocation per Flow resource, by priority tier (0 people, 1 animals, 2 everything else), proportional within a tier, from the start-of-day stock. Capacity resources: satisfaction = min(1, available ÷ required), shared proportionally. Ambient: satisfied by the day's ambient value, never depleted.
> 6. Production: satisfaction per instance = min over `required` inputs (Leontief); outputs = nominal × satisfaction × Π(1 − w·(1 − boost satisfaction)) × maturity(age). Outputs go into stocks at end of day (one-day lag; this keeps the step order-independent and deterministic).
> 7. People: each Human Being tracks unmet food, drinking water, heat, and shelter over a rolling 7 days. Health factor = 1 − penalties (documented, bounded at 0.3); it scales their labor output. Hardship events fire when a need is below 80% for 3+ days.
> 8. Storage and loss: water and food capped by storage (+ buffers); electricity above battery capacity is spilled and counted; perishables spoil at `spoilPerWeek`/7, reduced for the share inside food storage; heat and cooling never store.
> 9. Money: Capital outputs add to cash, inputs subtract; if cash < 0, Capital-dependent systems curtail.
> 10. Ledgers and events: shortages (with the curtailed instances named), spoilage, spilled power, harvests, completions, hardship, milestones.
>
> **Tests:**
> - Conservation: for every Flow resource and day, start stock + produced − consumed − spilled − spoiled = end stock (1e-9).
> - Balance agreement: starter design, 80% mode, front-range site, no construction (all prebuilt), year 2 averages within 5% of balance mode for every checklist row that is not storage-limited; document every row that differs and why (the point is to explain differences, not hide them).
> - Determinism: same seed and actions → same digest; digests for three designs committed.
> - Performance: one simulated year of a 200-instance design < 150 ms in Node.
> - Scenario tests that read like the game: "no stove, January → Heated shelter unmet and hardship event fires"; "3 panels, no battery → electricity spilled at noon equivalent is counted, night demand unmet"; "raised bed with no water → zero yield, garden instance named in shortage event".

**Outputs:** time engine, site presets, `docs/ENGINE.md` time section with the step order and every penalty constant.
**Handoff condition:** all tests above green; CLI `npm run sim -- run designs/starter.json --years 3 --site laramie-wy` prints a monthly table of checklist coverage and the three biggest shortages.

---

# Phase G4 — Map, Drawer, and Placement

### Session G4 — The Playfield

The reference screenshots show the layout to aim for: a collapsible left drawer with a system catalog, and a large top-down field of grass where systems sit as small pixel sprites and people wander. Keep that shape; make the interactions better.

**Claude Code session prompt:**

> Build the main screen in `apps/web` with PixiJS (v8) for the map and React for panels. Zustand store wraps the engine; the undo stack lives in the store, not the engine.
>
> **Map**
> - Top-down field sized to the land parcel (1 acre default = ~209 × 209 ft; 1 world unit = 1 ft). Grass texture that shifts with season (green, gold, snow-dusted) and a soft parcel boundary.
> - Pan (drag, WASD/arrows), zoom (wheel, pinch, +/−), zoom-to-fit. Minimap in a corner.
> - Systems render as sprites scaled to footprint (a food forest covers ground; a filter is a small icon). Until real art exists, generate placeholders: a rounded tile colored by first category with a centered glyph and the system's short name on hover. Keep a sprite manifest so real art drops in by key.
> - Human Being instances are animated figures that idle and walk between the systems they "work" (purely cosmetic; driven by a seeded random walk).
> - Placement: choose a system in the drawer → ghost sprite follows the cursor showing its footprint; green if valid, red if it overlaps another footprint or leaves the parcel. Click to place, Esc to cancel, Shift-click to place repeatedly. Optional snap-to-grid (1 ft / 5 ft / 10 ft) toggle.
> - Selection: click, Shift-click, and drag-box select. Move by dragging, Delete to remove (refund 25% of cost if built, 100% if still under construction), Ctrl/Cmd-C/V to duplicate, Ctrl/Cmd-Z/Y undo/redo.
> - Instances under construction show scaffolding and a progress ring.
>
> **Left drawer (collapsible, remembers state)**
> - Tabs: **Systems**, **Inputs**, **Outputs**.
> - Systems tab: segmented toggle **All / My** (My = systems in the design, with counts). Category filter dropdown (the 24 categories, alphabetical, with counts). Quick search (fuzzy, matches name, category, and resources a system makes or uses — typing "eggs" finds chickens, ducks, quail). Grid of sprite tiles; hover shows name, cost, and the top two outputs; click opens the System Card; drag onto the map places it.
> - Inputs tab: every resource the design consumes, with supply bars (supplied / needed, this week) and a filter for "shortages only." Clicking a resource highlights its producers and consumers on the map.
> - Outputs tab: every resource the design produces, with where it goes (consumed, stored, spilled, spoiled).
>
> **HUD (top bar)**: land name, season/day/year, weather icon, cash, labor hours used/available this week, overall off-grid score ring. Pause / 1× / 3× / 10× speed buttons and keyboard (Space, 1, 2, 3).
>
> Playwright: place a yurt, a well, three panels; move one; undo; redo; delete; assert state and save screenshots at each step.

**Outputs:** map, drawer, HUD, placement and selection, placeholder sprite generator, e2e spec.
**Handoff condition:** 60 fps pan/zoom with 300 instances in a Playwright performance trace; every interaction above covered by e2e; screenshots in the PR.

---

# Phase G5 — System Card, Checklist, and Flow Overlay

### Session G5 — Information Surfaces

**Claude Code session prompt:**

> **System Card** (modal or side sheet, opened from the drawer or by double-clicking an instance). Mirrors the reference layout and adds the "why":
> - Title, category pills, one-paragraph description, sprite.
> - **Add** button with a choice: **Buy** (cost, fast setup) or **Build it yourself** (DIY cost, full setup labor). Show both costs and setup hours side by side.
> - **Inputs** panel: one row per input with icon, name, a progress bar showing *supplied / needed* in the flow's own period ("0.5 / 0.5 hours needed weekly", "0.1 / 0.1 oz per season"), and a role tag (required, boost, capacity). For a placed instance, bars show this instance's live satisfaction; in the catalog, they show what the current design could supply.
> - **Outputs** panel: produced amount per period and where it went last week.
> - **Labor** block: setup hours and weekly upkeep.
> - **Details** (collapsed): lifespan, footprint, years to full output, confidence, source (game-captured vs. new), notes, and the list of catalog rows. This replaces the reference game's outbound "Learn more" link.
>
> **Needs Checklist** (full-screen view, keyboard `N`). The reference game's 11-row table: need, icon, provided, total needed for N humans, % covered, check or cross, and the overall score ring with a one-paragraph summary. Improvements:
> - Toggle **Average year** (balance mode) vs **This season** vs **Worst week this year** (time mode). The gap between them is the lesson.
> - Each cell opens the "why" popover from engine provenance.
> - A sparkline per row of the last 52 weeks.
>
> **Design summary strip** (the reference game's three lists): **Inputs (n)**, **Systems (n)**, **Outputs (n)**, each scrollable and clickable.
>
> **Flow overlay** (keyboard `F`): animated lines between producers and consumers for the selected resource or instance, width ∝ flow, red dashes where a consumer is short. A resource legend lets the player toggle Water, Power, Food, Heat, Waste, Labor.
>
> Playwright: open a card, switch Buy/DIY, open the checklist, open a "why" popover, toggle the overlay; screenshots.

**Handoff condition:** every number on the checklist and cards has a working "why" popover backed by engine provenance; the Average-year checklist equals balance mode exactly.

---

# Phase G6 — Time, Saving, and the Almanac

### Session G6 — Game Loop Quality of Life

**Claude Code session prompt:**

> - **Calendar and clock:** four seasons of 28 days each for display, mapped onto the 365-day engine calendar (store the mapping; the engine stays on real days). Day ticks animate at the chosen speed; the map tints for dawn/dusk only at 1×.
> - **Auto-pause** (each toggleable in settings): first shortage of a checklist need, hardship event, construction complete, harvest, first frost, cash below one month of costs, end of season.
> - **Almanac** (keyboard `L`): chronological event log with filters (shortages, harvests, builds, weather, money), each entry linking to the instance on the map.
> - **Toasts** for events, stacked and dismissable, with a "show on map" action.
> - **Season report** at each season's end and a **Year report** at year's end: checklist coverage by month, top shortages and their root causes (the curtailment chain: "Raised beds short on Water because Well short on Electricity because panels produce 30% less in winter"), cash flow, labor hours by system, spoilage and spilled power, and suggested fixes drawn from the catalog (systems that produce the short resource and fit the budget).
> - **Save/load:** three manual slots plus autosave every in-game week; export and import a `.homestead.json` (schema-versioned, includes seed and full action log); `?design=` URL parameter loads a shared design read-only.
> - **Undo/redo** covers placement, removal, moves, and settings; time advancing is not undoable, but **Rewind** restores the last autosave.
> - **Settings:** units (imperial/metric), speed defaults, auto-pause toggles, grid snap, colorblind-safe palette, reduced motion, UI scale.
>
> Replay test: export a save after 2 years of scripted play, import it into a fresh app, replay the action log, and assert the same digest.

**Handoff condition:** replay digest matches; autosave survives a page reload (IndexedDB, wrapped in try/catch with a visible warning if storage is unavailable); year report renders for the starter design with at least one root-cause chain.

---

# Phase G7 — Space Matters

### Session G7 — Adjacency, Terrain, and Sites

**Claude Code session prompt:**

> Add spatial rules through `catalog_overrides.json`, never hard-coded:
> - `adjacency` rules: `{ from: systemId|category, to: systemId|category, radiusFt, effect: { resource, multiplier } }`. Starter rules: shade trees within 30 ft of a shelter scale that shelter's cooling load by 0.9 each (floor 0.7); beehives and pollinator systems supply Pollination only within 300 ft; chickens within 20 ft of a compost pile add 10% to compost output; rain catchment systems must be within 50 ft of the shelter whose Roofing area they use; a wind turbine within 150 ft of trees loses 30%.
> - Roofing area and paddock become *assigned* capacities: the player links a collector to a roof (auto-assign nearest by default); the card shows the link.
> - **Terrain layer** per site: slope (affects swales and ponds), a stream line if the site has Stream Frontage, existing trees. Terrain is read-only (the site is a constraint, not a lever).
> - **New game wizard:** pick a site preset, parcel size (¼, 1, 5 acres), starting cash, household (adults, children as fractional Human Being), difficulty (Average years / Real weather), and a starting kit (empty, tent camp, suburban home to convert).
>
> Tests: adjacency multipliers appear in provenance; moving a tree next to a cabin changes its cooling load and the "why" popover says so.

**Handoff condition:** the same design on `laramie-wy` vs `asheville-nc` produces different heating, water, and garden outcomes, each traceable to a site value in a "why" popover.

---

# Phase G8 — Goals, Guidance, and Feel

### Session G8 — Onboarding and Progression

**Claude Code session prompt:**

> - **Tutorial quests** (skippable, one at a time, pinned top-right): "Shelter two people," "Drinking water every day for a week," "Cook without buying fuel," "Make it through January warm," "Grow 10% of your calories," "Close a loop: turn food waste into compost into vegetables." Each quest names the checklist row it moves.
> - **Milestones** (quiet badges, not a slot machine): first harvest, 30 days without a shortage, first closed loop, net-positive cash for a season, 50% / 75% / 90% off-grid score for a full year.
> - **Hints:** when a shortage persists for a week, a hint card suggests 2–3 catalog systems that produce the short resource, ranked by cost per unit of shortfall covered, and shows what else each would need.
> - **Feel:** gentle placement and harvest animations (respect reduced motion); optional ambient sound toggle (off by default; ship none until original audio exists); seasonal palette shifts; people sprites visibly carry things at harvest.
> - **Accessibility pass:** full keyboard play (Tab through drawer, arrow keys to move a selected instance, Enter to place), visible focus, ARIA labels on every control, contrast AA, no information by color alone (icons plus text on shortages).

**Handoff condition:** a scripted Playwright "first 15 minutes" run completes the first three quests with only keyboard input.

---

# Phase G9 — Decision-Support Layer

### Session G9 — Scenarios, Uncertainty, and Export

This is where the game earns its place next to a planning tool.

**Claude Code session prompt:**

> - **Real weather mode (the "90%" model):** seeded interannual draws on the site profiles (annual precipitation multiplier, CV ≈ 0.25 in arid sites; degree-day multiplier ± 8%; late-frost event shortens the season 21–30 days; heat waves; hail that cuts a week of garden output). Documented distributions in `docs/ENGINE.md`; all draws recorded in the save.
> - **Scenario compare:** pin up to three designs and view them side by side (checklist, cost, labor, land, autonomy days, cash flow). "Duplicate as scenario" from the current game.
> - **Monte Carlo:** run a design for 10 years × 200 seeds in a Web Worker; show the distribution of worst-week coverage per checklist row and the probability of any hardship month. Same engine, headless; progress bar; cancelable.
> - **Sensitivity:** tornado chart of overall score vs ±20% on each Assumptions value and the ten flows with the largest effect on the design's weakest row.
> - **Exports:** design JSON; a per-year **flow record** (`homestead.flow_record.v1`: land by use, monthly electricity import/export and peak, water withdrawal vs. consumptive use, food produced/imported, fuel by type, capex, labor, hardship months); CSV of daily ledgers; a PNG of the map.
> - **CLI parity:** `npm run sim -- montecarlo designs/x.json --site laramie-wy --years 10 --seeds 200` reproduces the in-app numbers exactly for the same seeds.

**Handoff condition:** Monte Carlo in-app and CLI agree to the digit for the same seeds; a design's 80% and 90% results are shown together on the scenario view.

---

# Phase G10 — Polish, Performance, Deploy

### Session G10 — Ship It

**Claude Code session prompt:**

> - Performance budget: first load < 2.5 s on a mid laptop (Lighthouse in CI), 60 fps at 500 instances, a simulated year at 10× in < 1 s of wall time (engine in a Web Worker if needed).
> - Error boundaries around every panel; a corrupted save shows what failed and offers the last good autosave.
> - Responsive layout: desktop first, tablet usable (drawer becomes a bottom sheet under 900 px wide).
> - Deploy the static build to GitHub Pages from `main` via Actions; PR preview builds as CI artifacts.
> - Final docs: player guide (`docs/PLAYING.md`), modding guide (how to add a system in the xlsx and re-export), and an updated `ENGINE.md`.

**Handoff condition:** public URL loads, a new player can finish the tutorial, and `npm run catalog:export` after adding one system to the xlsx makes it appear in the drawer with no code change.

---

## Art Track (parallel, no session required)

- Sprite manifest `apps/web/src/sprites/manifest.json` maps `spriteKey` → image, footprint scale, anchor, and optional animation frames. Placeholders are generated until real art lands.
- Target style: 16×16 or 32×32 pixel sprites, top-down three-quarter view, limited palette per season. Commission or draw originals; do not trace the reference game.
- People: 4–6 original character variants with idle, walk, and carry frames.
- Priority order for art: shelters (20), energy (17), the six design-list systems from the screenshot, then everything else by how often it appears in the starter designs.

---

## Session Order and Dependencies

| Session | Deliverable | Depends on |
|---|---|---|
| G0 | Scaffold + CI | — |
| G1 | Catalog exporter, schema, goldens | G0 |
| G2 | Balance engine + parity | G1 |
| G3 | Time engine | G2 |
| G4 | Map, drawer, placement | G2 (G3 for construction visuals) |
| G5 | Cards, checklist, flow overlay | G3, G4 |
| G6 | Clock, saves, almanac, reports | G3, G4 |
| G7 | Adjacency, terrain, sites, wizard | G5 |
| G8 | Quests, hints, feel, accessibility | G5, G6 |
| G9 | Real weather, scenarios, Monte Carlo, export | G6, G7 |
| G10 | Performance, deploy, docs | all |

G4 can start once G2 lands (placement only needs the catalog and balance mode) and run in parallel with G3 on a separate branch.

---

## Known gaps carried forward honestly

- Catalog numbers are rounded rules of thumb with a confidence column; the engine makes them consistent, not correct. Improving them is spreadsheet work, not code work.
- A daily step with weekly-average inputs hides within-day timing (solar noon vs. night load). Batteries are modeled as a daily buffer, not hourly dispatch.
- Heating uses degree-days and a single heat-loss factor per building; no thermal mass except where a system's heat output represents it.
- Health effects of unmet needs are a bounded game mechanic, not a physiological model; say so in the player guide.
