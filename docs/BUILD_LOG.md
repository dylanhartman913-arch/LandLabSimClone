# Build log

Newest entries at the bottom. Each session appends: what shipped, test counts, digests, known gaps.

---

## G0 — Workspaces, CI, and conventions (2026-09-28)

**Branch:** `claude/gifted-hypatia-x158zw` (the cloud session was pinned to this branch, so G0 onward share it; each session is its own commit series).

**Shipped**
- npm workspaces: `packages/catalog`, `packages/engine`, `packages/cli`, `apps/web` (`@homestead/*`). Packages export TypeScript source directly (`main: src/index.ts`), so there is no package build step; Vite, Vitest, and `tsx` consume the source.
- TypeScript 5.9 strict (`tsconfig.base.json`, plus `noUncheckedIndexedAccess`), ESLint 9 flat config with typescript-eslint, Prettier, Vitest 3 at the root, Playwright 1.56 in `tests/e2e`.
- Engine purity is enforced by ESLint: `no-restricted-imports` (react, react-dom, pixi.js, zustand, apps/*), `no-restricted-properties` (`Math.random`, `Date.now`), and `no-restricted-globals` (window, document, localStorage) on `packages/engine/**`. `packages/engine/test/purity.test.ts` lints probe snippets to prove the rule fires.
- Spreadsheet committed at `data/source/LandLab_Sim_Systems_v2.xlsx` (first commit). `data/catalog_overrides.json` created empty.
- `apps/web`: Vite + React smoke page, titled **TERRA Homestead Plugin**, showing the engine version (proves the workspace link).
- `.github/workflows/ci.yml`: `npm ci`, typecheck, lint, catalog check, vitest, Playwright Chromium install, web build, e2e against `vite preview`, screenshot artifact upload.
- Root scripts: `dev`, `build`, `test`, `test:e2e`, `typecheck`, `lint`, `catalog:export`, `catalog:check` (placeholders until G1), `sim`.

**Tests:** 5 unit (version + 4 purity probes), 1 e2e smoke. Screenshot: `docs/screenshots/g0/smoke.png`.

**Known gaps**
- `git push` from the sandbox returned 403 (the Claude GitHub App has no access to the repo yet); work is committed locally and pushed once access is fixed, so CI has not run remotely yet.
- `xlsx@0.18.5` is the last SheetJS release on the npm registry and has open advisories (prototype pollution, ReDoS). It only ever parses our own committed spreadsheet at export time and never ships in the web bundle.

---

## G1 — Catalog exporter and schema (2026-09-28)

**Shipped**
- `packages/catalog/src/schema.ts`: zod schemas and exported types for `Resource`, `System`, `Flow`, `QtyExpr` (const, sun, rain, pv, wind, hydro, catchArea, rainCapture, heatLoad, coolLoad), `Timing`, `StorageRule`, `AdjacencyRule`, `Assumptions`, the period table, `Catalog`, `Overrides`, `Goldens`.
- Exporter (`src/exporter/`): reads all nine sheets with SheetJS (formulas and cached values), finds columns by header, recognizes formula templates by regex (resolving Assumptions cells by label, and checking every `$B<row>` lookup is the flow's own row), evaluates each expression and cross-checks it against the cached cell to 1e-9.
- Validators: unknown resource/system, class-vs-period, duplicate names/IDs, unknown category, negatives, upkeep-vs-Labor, unit mismatch, unknown checklist rows, bad overrides. All problems are reported together.
- Default rules for engine-only fields with per-field provenance (`xlsx` / `override` / `default-rule`); overrides may only set engine fields (strict zod).
- `generated/catalog.json` (168 systems, 797 flows, 62 resources, 25 categories incl. hidden Household) and `generated/goldens.json` (starter counts, checklist, overall score 0.485028917841418, 21 Design Summary metrics, 62 resource balances, 797 per-flow cached values).
- `npm run catalog:export` / `npm run catalog:check` (in-memory re-export diffed against committed files; wired into CI).
- `docs/CATALOG.md`: every field, its source, templates, validators, default rules, overrides format, how to add a system.

**Tests:** 32 unit (13 export/defaults, 14 validation with mutated copies of the real workbook as broken fixtures, 5 from G0).

**Decisions**
- Adjacency rules live at catalog top level (`adjacencyRules`), not per system, since a rule names both ends.
- Food storage needs a packing density to compare lbs/eggs/gal with cu ft; the defaults are documented in CATALOG.md and overridable.
- The "broken fixture xlsx" files are generated in-test by editing a copy of the real workbook, so they never drift from the real schema.

**Known gaps**
- `catalog.json` is ~720 KB raw because every record carries its provenance map; fine for now (≈90 KB gzipped).

---

## G2 — Balance engine and spreadsheet parity (2026-09-28)

**Shipped**
- `packages/engine`: `evalQty`, `weeklyFactor` / `weeklyEquivalent`, `balance(catalog, assumptions, design)` returning resource balances, the 11-row Needs Checklist, overall score, and all 21 Design Summary metrics, each as `Explained { value, explain: { formula, terms, refs?, assumptions?, notes? } }` built during computation.
- Parity suite: every per-flow qty and weekly equivalent (797), checklist cell, summary metric, and resource balance row matches the spreadsheet's cached values within 1e-9 relative. Starter: 48.5% overall, 697,846 BTU/wk heat need, 4,979 of 16,000 kcal/wk food.
- Designs: `designs/starter.json` (from the xlsx), `offgrid-cabin-family.json`, `suburban-baseline.json`, `tent-and-nothing.json` (design files may key counts by system name or ID).
- Digests (`packages/engine/test/digests.json`): starter `82321850e103bf29`, off-grid cabin `c1329b2231f72a22`, suburban `82727e99a8118796`, tent `6e161d1468e09ba2`.
- CLI: `npm run sim -- balance designs/starter.json` prints the checklist table and a summary.
- `docs/ENGINE.md` balance section.

**Tests:** 50 unit total (18 new in engine: parity 9, designs/digests/scenarios 8, performance 1).

**Performance:** 1,000 balance calls on a 200-instance design, best of three batches: ~75-85 ms under Vitest, ~100 ms standalone (budget 200 ms).

**Known gaps**
- The suburban baseline covers only 58% of its heat need: the catalog's Heat Pump (Mini-Split) output is sized for one small zone, not a 2,000 sq ft house. That is a spreadsheet fact, not an engine bug.

---

## G3 — Time engine: daily clock, stocks, allocation, seasons (2026-09-28)

**Shipped**
- `docs/ENGINE.md` time section written first (API, state, climate, flow shapes, the 10-step daily order, every constant, groups, balance agreement, performance, known simplifications).
- `packages/engine/src/time/`: `initGame`, `canPlace`, `placeSystem` (buy / DIY / prebuilt), `moveSystem`, `removeSystem` (25% / 100% refunds), `setPriority`, `placeDesign`, `stepDay`, `stepDays`, `summarizeLedgers` / `summarize`. Pure functions over plain-JSON state with a seeded mulberry32 RNG.
- Daily step: weather → construction materials (shortfalls imported and logged) → labor pool (construction first, up to 60%) → requests → tiered proportional allocation (Food met from any food-family stock, most perishable first) → Leontief satisfaction with boosts and maturity → people (7-day needs, health floor 0.3, hardship after 3 days below 80%) → storage pools, direct-use electricity, spoilage (80% slower in cold storage) → cash → events and ledger.
- Site presets `data/sites/{front-range,laramie-wy,asheville-nc}.json` (monthly shapes rescaled to scalar annual totals; front-range equals the spreadsheet's Assumptions), with growing seasons, ambient availability (Asheville has a stream), and terrain for G7.
- Catalog engine fields added through default rules: input role `need`, timing `heating`/`cooling` (plus garden irrigation in season), `storable`, `directUseShare` (Electricity 0.5), `satisfiedBy` (Food ← food family), `layer` (ground plantings). `data/catalog_overrides.json` now turns 26 clearly supplementary inputs into boosts, each with a note.
- Validation setting `unlimitedSupply` for checking time mode against balance mode.
- CLI: `npm run sim -- run designs/starter.json --years 3 --site laramie-wy` prints monthly coverage per checklist row, health, and the three biggest shortages with the systems they curtail.

**Tests:** 88 unit total. New: 18 scenarios (no stove in January → heat hardship on day 3; 3 panels no battery → noon surplus spilled, exactly half of demand met; raised bed with no water → zero yield, named in the Water shortage event; priority, substitution, spoilage, construction, maturity, placement), conservation over 3 designs + validation mode + construction/removal (1e-9), balance agreement (unlimited supply: 0.00% on every row for 3 designs; starter with real supply: six documented curtailment chains, each cause asserted), determinism (committed digests), immutability, performance.

**Digests (one year, seed 42, plus a DIY yurt):** starter `2f421ff10477d7a9`, off-grid cabin `c0da08bb643e8161`, suburban `84e47ac086416c3f`.

**Performance:** one year of a 196-instance design: ~40-55 ms in plain Node (budget 150 ms). As one 500-line function the step never got TurboFan-optimized (~140 ms); split into phases it does.

**Decisions (creative license, all documented)**
- Human Being inputs and shelter Heat/Cooling are `need` inputs: shortfalls hurt health and the checklist but do not switch the consumer off.
- Electricity `directUseShare` 0.5: daytime loads can use yesterday's solar without a battery (the roadmap's "night demand unmet" scenario implies this).
- Non-storable services (heat, cooling, cooking fuel, transport, sanitation) carry over one day, then spill; labor is recomputed each morning from health.
- Missing construction materials are brought in and logged rather than blocking construction.

**Known gaps**
- Real-weather mode is a stub until G9 (`weatherFor` returns the average day; frost tags only).
- One allocation pass (returned stock is not re-offered the same day).
- The starter design is harsh in time mode (23-24% overall on laramie-wy): its well has no battery and loses the daytime power to the household. That is the lesson the year report (G6) should surface.

---

## G4 — The playfield: map, drawer, placement (2026-09-28)

**Shipped**
- `apps/web`: Vite + React 19 + PixiJS 8 + Zustand 5. The store (`store/game.ts`) wraps the engine; undo/redo lives in the store as commands with exact inverses (`store/commands.ts`, engine `insertInstance` / `deleteInstance`), so undo works while the clock runs and time itself is never undone.
- Map (`map/scene.ts`): 1 world unit = 1 ft; parcel sized from acres with a shaded outside and soft boundary; seasonal grass (baked texture, spring/summer/fall tints, snow dusting in winter); the site's existing trees and stream; systems as placeholder sprites scaled to footprint (ground-layer plantings under objects); people as small figures on a seeded cosmetic random walk; scaffolding and a progress ring while building.
- Interactions: pan (drag, right/middle drag, WASD/arrows), zoom (wheel around cursor, pinch, +/−, 0 to fit), minimap with click-to-jump; placement ghost (green valid / red overlap or off-parcel), click to place, Shift-click to keep placing, Esc to cancel, snap 1/5/10 ft; click / Shift-click / Shift-drag box select; drag to move (snaps back if invalid); Delete (25% refund if built, 100% while building); Ctrl/Cmd-C/V duplicate at the pointer; Ctrl/Cmd-Z/Y undo/redo; double-click opens the card.
- Drawer (collapsible, remembered in localStorage with try/catch): Systems tab (All / My with counts, 24 categories alphabetical with counts, fuzzy search over name, category, and resources made or used, tile grid with hover card showing cost and top two outputs, click opens the card, drag onto the map places); Inputs tab (supplied / needed this week with shortage bars, "shortages only", click to highlight producers green and consumers amber on the map); Outputs tab (used / stored / spilled / spoiled).
- HUD: land name, date and season, weather glyph with a text label, cash, labor used / available this week, off-grid score ring (balance mode, average year), speed buttons and keys (Space, 1, 2, 3), snap, zoom to fit.
- A first System Card: description, category pills, Buy vs Build it yourself with both costs and setup hours, inputs and outputs per period (G5 extends it).
- Engine views so React does no arithmetic: `hudMetrics`, `designCounts`, `designBalance`, `resourceWeek`, `systemFlows` (all values `Explained`).
- Placeholder art: original vector glyphs per category drawn by Pixi (map) and SVG (drawer), with a sprite manifest (`sprites/manifest.json`) keyed by `spriteKey` so real art drops in.

**Tests:** 93 unit (5 new: drawer search, e.g. "eggs" finds chickens, ducks, quail). 7 e2e: the roadmap flow (yurt, well, three panels; overlap rejected; move; undo; redo; delete with full refund; undo delete), drag from drawer, box select + copy/paste + keyboard camera, speed and construction progress, drawer filters / My / remembered collapse, 300-instance performance, smoke. Screenshots: `docs/screenshots/g4/01…12`.

**Performance (300 instances, scripted pan + zoom):** scene work 0.05 ms and render submission 0.6 ms per frame, so the CPU side fits a 60 fps budget ~25× over. The sandbox (and GitHub's runners) have no GPU: Chromium rasterizes WebGL with SwiftShader, and the frame interval there is ~47 ms at 1440×900, bound by software fill rate (an empty map is ~30-45 ms). The test asserts the CPU budget everywhere and the 60 fps interval only when a hardware GPU is present. Not verified: 60 fps on real hardware.

**Known gaps**
- The web bundle is ~1.1 MB (225 KB gzipped), mostly the catalog JSON with provenance; code-splitting is G10.
- The default new game (two people, a bell tent, two months of groceries) is a stopgap until the G7 new-game wizard and starting kits.

---

## G5 — Information surfaces: System Card, Needs Checklist, flow overlay (2026-09-28)

**Shipped**
- **"Why" everywhere.** `WhyNum` makes every number on the checklist, the cards, and the HUD a button that opens a popover built from the engine's provenance: the formula, the flow-level terms (system, flow ID, qty × weekly factor × count × unit factor), named refs, the site assumptions used with their values, notes (e.g. the curtailment behind a time-mode shortfall), and the catalog confidence of the systems involved.
- **System Card** (drawer click, double-click an instance, or Details on a selection): category pills, description, Buy vs Build it yourself as a choice showing both costs and setup hours, then Add. Inputs with supplied / needed bars in the flow's own period and a role tag (required, boost, capacity, site, need). From the catalog, bars show what the current design supplied last week; for a placed instance they show that instance's live supply yesterday, with its satisfaction, the input limiting it, maturity, construction progress, and a priority control (serve sooner / later, undoable). Outputs with produced per period and where the resource went last week. Labor block. Collapsible Details: lifespan, footprint, years to full output, confidence, source, notes, and the catalog rows (system ID and every flow ID, with the provenance of its role and timing) in place of an outbound link.
- **Needs Checklist** (N, or click the score ring): the 11 rows with provided, needed for N humans, % covered, covered/short (icon plus text), overall ring and a plain-language summary. Views: Average year (balance mode, the same objects, so it equals the parity-tested numbers exactly), This season, and Worst week this year (time-mode ledgers; the worst 7-day window). A sparkline per row over the last 52 weeks. Design summary strip: Inputs (n), Systems (n), Outputs (n), clickable.
- **Flow overlay** (F, or the Flows button): lines from producers to consumers sized by flow, moving dots for direction, red dashes where a consumer was offered less than it asked for, a dashed red ring where nothing in the design makes what it needs; a legend toggling Water, Power, Food, Heat, Waste, Labor; with one system selected, only its flows. Stocks are pooled in the engine, so each consumer's receipt is split across producers in proportion to their output: an honest picture of a shared pool, not of pipes.
- Engine views: `systemCard`, `checklistView`, `sparklines`, `flowLinks`, `FLOW_GROUPS`. The engine now records, per input, what allocation offered (`granted`) separately from what the consumer used (`received`), so a bed limited by seeds is not shown as short of water.

**Tests:** 95 unit (7 new for the views). 8 e2e (new: card with Buy/DIY switch and details, a card "why" showing HDD from the site, every Average-year checklist value equal to balance mode via `data-value`, all 33 checklist "why" popovers open with a formula, season and worst-week views, an instance card, the overlay and legend). Screenshots: `docs/screenshots/g5/01…10`.

**Known gaps**
- Per-instance history is not kept (only yesterday's group results), so an instance card's bars are "yesterday", not "last week".
- The overlay caps at 250 links for legibility.

---

## G6 — Clock, saves, almanac, reports (2026-09-28)

**Shipped**
- **Calendar:** the HUD shows a display calendar of four 28-day seasons ("Spring 12, year 1") mapped onto the engine's real 365 days (`displayDate`; spring Mar 1, summer Jun 1, fall Sep 1, winter Dec 1), with the real date underneath. Days tick at 1/3/10 per second; at 1× the map gets a warm dawn and a blue dusk within each day (off with reduced motion).
- **Auto-pause** (each toggleable): first shortage of a household need, hardship, construction complete, harvest, first frost, cash below a month of running costs, end of season. The toast says why.
- **Almanac (L):** every event newest first with filters (shortages, harvests, builds, people, weather, money), each linked to its instance ("Show on map" selects it and centers the camera).
- **Toasts** for builds, harvests, hardships, and shortages, stacked (three at most, de-duplicated), dismissable, with "Show on map".
- **Season and year reports** open automatically: coverage by month, the top shortages with their root-cause chains and affordable catalog fixes, money, labor by system, construction hours, spoilage, spilled power. The starter design's year report reads, e.g., "Bell Tent short on Heat because nothing in the design makes Heat"; the engine test asserts "… short on Water because Well short on Electricity because …".
- **Saves:** three slots and an autosave every in-game week in IndexedDB (every call wrapped; a visible warning if storage is blocked), Rewind to the last autosave, export/import `.homestead.json` with the seed and full action log (replayed and digest-checked on import), restore-on-reload, and `?design=` links that open a shared layout read only (edits refused, "Make a copy to edit"). `?new` starts fresh.
- **Undo/redo** now covers placement, removal, moves, priority, and the one game setting (work split), and every undo/redo is logged as actions.
- **Settings:** units (imperial/metric, display only), resume speed, auto-pause toggles, grid snap, colorblind-safe palette (blue/orange, also on the map), reduced motion (people and flow dots stand still, no dawn/dusk), UI scale, and the household work split.
- Engine: `Action`, `applyAction`, `replay`, `gameDigest`, `SaveFile`, `validateSave`, `moveInstances`, `displayDate`, `buildReport`, `rootCauseChain`, `suggestFixes`; ledgers gain `laborBySystem`. `docs/ENGINE.md` gains "Saves and replay" and "Reports and root causes".

**Tests:** 106 unit (new: two years of scripted play replay to the same digest, save round-trip, schema errors; report chains for the starter's water, winter solar, and "nothing makes it"). e2e (new file `gameloop.spec.ts`): export after two years → import into a fresh browser context → "Replay verified" and identical digest; autosave written after a week and restored after reload; storage-blocked warning; shared starter design read only with a year report containing a "because" chain; auto-pause, almanac, settings, undoable work split. Playwright now runs one worker (software rendering makes parallel browsers starve each other). Screenshots: `docs/screenshots/g6/`.

**Known gaps**
- Replay cost grows with game length (a two-year game replays in well under a second).
- The share link carries counts only (it lays the design out automatically), not positions.

---

## G7 — Space matters: adjacency, terrain, sites, new-game wizard (2026-09-28)

**Shipped**
- Catalog: adjacency rules gain `stack` and a `terrain:tree` source; new `assignedCapacities` and `terrainRules` sections, validated at export. `data/catalog_overrides.json` ships the roadmap's starter rules: shade (30 ft, ×0.9 each, floor 0.7, existing trees included), pollination within 300 ft, chickens by compost +10%, trees within 150 ft of a turbine −30%, rain catchment on a roof within 50 ft (assigned), paddocks (assigned), swales +4%/pond −3% per percent of slope.
- Engine: `computeSpatial` (edge-to-edge distances, cached by a content key), grouping by spatial signature, per-instance roof/paddock assignment with player links (`setLink`, action `link`), `require` gates, household `scale` (children 0.6), and `designAdjust` feeding balance mode so the Average-year checklist and its "why" show placement effects.
- Kits and wizard: `newGameFromOptions` builds a game and its day-0 actions (so it replays) for empty land, a tent camp, or a suburban home to convert, placing each system at the nearest valid spot. The New game wizard (first visit, or Saves → Start a new homestead) picks site, parcel (¼, 1, 5 acres), cash, adults and children, weather (average or real; real weather arrives in G9), and kit.
- UI: the System Card's "Where it sits" lists placement effects and a roof/paddock picker ("Nearest with room" or a specific provider in range); selecting a tree, hive, or coop draws its effect radius, and a collector draws a line to its roof; "why" rows show the × placement factor. Checklist time-mode rows carry the site values behind them (HDD, CDD, precipitation, sun, and growing-season days) so two sites can be compared.
- Terrain is read-only: the stream and existing trees draw on the map (fractions of the parcel side, so they scale) and existing trees shade and disturb wind.

**Tests:** 126 unit (new: spatial rules 9, two sites one design, kits 10). e2e `space.spec.ts`: dragging a tree beside a cabin lowers the cooling need and the popover names the shade and the Oak Tree; a rain collector links to the nearest roof and the card switches it to the yurt (undoable); the wizard sets up Asheville on ¼ acre with two children and a suburban kit; the same design on Laramie vs Asheville shows 9,140 vs 3,760 HDD in the heat "why". Screenshots `docs/screenshots/g7/`.

**Digests re-recorded (intended):** `time:starter.json` `d3c7db5705dadb12`, `time:offgrid-cabin-family.json` `b80456dd705d9f94`; placed layouts now feel shade from the site's existing trees. Balance digests and spreadsheet parity are unchanged. Time-mode agreement tests now compare with balance mode plus the same spatial adjustments.

**Known gaps**
- Terrain water (the stream) is decorative for collision; systems may sit on it.
- Real-weather mode is selectable but behaves as average until G9.
- Effects are recomputed when layout changes, not when a source matures (a sapling shades like a tree once built).

---

## G8 — Goals, guidance, feel, accessibility (2026-09-28)

**Shipped**
- **Tutorial quests** (`QUESTS` in `packages/engine/src/views/quests.ts`), one at a time, pinned top-right, skippable ("Skip tutorial"). The six the roadmap lists, in order: Shelter two people; Drinking water every day for a week; Cook without buying fuel; Make it through January warm; Grow 10% of your calories; Close a loop (food waste into compost into vegetables). Each quest names its checklist row, has a hint line, and returns `{done, progress, detail}` from game state, so the card shows a progress bar and one line of status ("4 of 7 days in a row").
- **Milestones** (`MILESTONES`): first harvest, 30 days without a household shortage, first closed loop, net-positive cash for a 91-day season, 50% / 75% / 90% off-grid score over a full year. They show as quiet badges under the quest card with the day earned: no sound, no popup beyond one toast.
- **Hints** (`shortageHints`): when a flow resource has been short on each of the last 7 days, a hint card lists up to 3 catalog systems that make it, ranked by cost per unit of the week's shortfall they would cover (`min(weekly output, shortfall)`), each with "also needs …" (its required inputs) and an Add button that opens its System Card. One hint card shows at a time (the largest shortfall first); dismissing it silences that resource for 28 days.
- Progress (`quests`, `milestones`, `tutorialSkipped`, `dismissedHints`) lives in the store, is updated after every tick (`updateProgress`), and is saved in slots, autosaves, and exports.
- **Feel:** new systems pop in with a small scale ease; harvests float a crop mark up from the plants; people carry crates for three days after a harvest; seasonal grass tints and winter snow (from G4); dawn and dusk light at 1× (from G6). With reduced motion, none of these animate. Reduced motion now defaults to the OS setting (`prefers-reduced-motion`) until the player changes it.
- **Keyboard play:**
  - `/` opens the drawer and focuses search, selecting any old text.
  - Tab moves through tiles, and Enter opens a card. The card focuses its Add button (or Close if there is none), and Enter adds.
  - In place mode, arrows move a visible keyboard cursor (a ghost) in steps of at least 5 ft, Shift for 10×. Enter places, Shift+Enter keeps placing, and Esc cancels.
  - With a selection, arrows nudge it (undoable).
  - L opens the almanac, N the checklist, F the flow overlay, and Space, 1, 2, 3 set the speed.
  - Shortcuts ignore text fields but not checkboxes or sliders.
- **Accessibility:** a `:focus-visible` ring on every control, ARIA labels on icon-only buttons and regions (HUD, drawer, map, badges, quests), a text label alongside every weather glyph and shortage icon, and a colorblind-safe palette (G6). Contrast was checked by eye against AA for the default theme; no automated contrast audit yet.

**Tests:** 132 unit across 15 files. New in `quests.test.ts` (6):
- A tent alone does not shelter two people, but adding a yurt does.
- A week of city water completes the water quest.
- A solar oven counts toward cooking without bought fuel, but a propane range does not.
- Every quest names a real checklist row.
- A tent camp earns no milestones in a week.
- A week with no water produces a hint that offers systems.

New e2e `keyboard.spec.ts` (2):
- **The roadmap's handoff condition, "first 15 minutes, keyboard only":** a yurt, a municipal water hookup, and a solar oven are placed using only `/`, typing, Tab, Enter, and arrows. At 10× speed, the first three quests complete.
- Arrow keys move a selected system, and focus stays visible.

Screenshots are in `docs/screenshots/g8/`.

**Known gaps**
- There is no ambient sound toggle yet. The roadmap says to ship no audio until original audio exists, so the setting was left out rather than shipped as a dead toggle.
- Contrast AA is not verified by a tool (axe or Lighthouse). That belongs with the G10 Lighthouse CI step.
- Two e2e specs (`information`, `playfield` speed) timed out once during a full-suite run under load and passed on rerun. That points to timing sensitivity with software rendering, not a logic bug, but it is worth watching in CI.

---

## Status at the end of the first run (G0–G8)

_Superseded by "Status at the end of the roadmap" below._

### Done

| Session | State | Handoff condition met? |
|---|---|---|
| G0 Scaffold, CI, purity lint | Done | Yes (locally; CI has never run remotely, see below) |
| G1 Catalog exporter | Done | Yes: `catalog:check` is clean, and the validators reject the broken fixtures |
| G2 Balance engine | Done | Yes: parity with the spreadsheet to 1e-9 on every flow, checklist cell, and summary metric |
| G3 Time engine | Done | Yes: scenarios, conservation, determinism, balance agreement, performance |
| G4 Playfield | Done | Yes: the yurt, well, and panels flow, plus 300 instances. 60 fps on real GPUs is not verified |
| G5 Information surfaces | Done | Yes: every checklist value equals balance mode, and every "why" opens |
| G6 Clock, saves, reports | Done | Yes: export, import in a fresh browser, replay to the same digest |
| G7 Space matters | Done | Yes: shade, roof links, the wizard, and site comparison |
| G8 Goals and feel | Done | Yes: the first three quests complete with keyboard only |

### Half-done or not started

- **Push and CI:** every `git push` from the sandbox returned 403, because the Claude GitHub App has no access to the repo. All work is committed locally on `claude/gifted-hypatia-x158zw`. Until access is fixed and a push succeeds, `.github/workflows/ci.yml` has never run on GitHub.
- **G9 (not started):**
  - Real weather is selectable in the wizard but behaves as the average year: `weatherFor` returns the average day, with frost tags only.
  - Not built: scenario compare, Monte Carlo in a Web Worker, CLI `montecarlo` parity, sensitivity or tornado charts, flow-record, CSV, and PNG exports.
- **G10 (not started):**
  - Lighthouse budget, error boundaries, the bottom-sheet layout under 900 px, the GitHub Pages deploy, `docs/PLAYING.md`, and the modding guide.
  - The web bundle is about 1.18 MB (247 KB gzipped), mostly the catalog with provenance, and is not code-split.
- **Partial within finished sessions:**
  - Per-instance history is not kept, so an instance card shows "yesterday", not "last week".
  - Share links carry counts, not positions.
  - Terrain water does not block placement.
  - Spatial effects do not ramp with maturity: a sapling shades like a full tree once it is built.
  - Allocation makes one pass, so returned stock is not re-offered the same day.
  - Replay cost grows with game length.
  - The ambient sound toggle and an automated contrast audit are missing (see G8).
- **Art:** everything is original placeholder vector glyphs. `apps/web/src/sprites/manifest.json` keys sprites by `spriteKey`, so real art can drop in without code changes.

### Tests

**Unit (Vitest), 132 tests in 15 files**

- `packages/catalog/test/`:
  - `export.test.ts`: templates, defaults, overrides, and the committed files staying in sync.
  - `validation.test.ts`: broken copies of the real workbook generated inside the test.
- `packages/engine/test/`:
  - `parity.test.ts`: spreadsheet goldens to 1e-9.
  - `balance-designs.test.ts`: the four designs, their digests, and balance performance.
  - `time-scenarios.test.ts`: the roadmap scenarios, plus priority, substitution, spoilage, construction, maturity, and placement.
  - `time-invariants.test.ts`: conservation, agreement with balance mode, determinism and time digests, immutability, and the year-performance check (a child process running an esbuild bundle).
  - `views.test.ts`: the checklist, card, flow overlay, and HUD, all with provenance.
  - `replay.test.ts`: replay to the same digest, save round-trip, schema errors.
  - `report.test.ts`: root-cause chains and fixes.
  - `spatial.test.ts`: shade, pollination, chickens by compost, turbine wake, roof and paddock links, slope, and one design on two sites.
  - `kits.test.ts`: the new-game kits.
  - `quests.test.ts`: quests, milestones, hints.
  - `purity.test.ts`: proves the engine lint rules fire.
  - `version.test.ts`.
- Digests: `packages/engine/test/digests.json`, holding 4 balance and 3 time digests. The time digests were re-recorded in G7 because of spatial effects.

**End-to-end (Playwright, Chromium with SwiftShader, one worker), 19 tests in 7 files**

- `smoke.spec.ts` (1).
- `playfield.spec.ts` (5): place, move, undo, redo, delete; drag from the drawer; box select and copy/paste; speed and construction; drawer filters.
- `perf.spec.ts` (1): 300 instances, CPU frame budget.
- `information.spec.ts` (1): the card, the checklist compared with balance mode, all "why" popovers, the flow overlay.
- `gameloop.spec.ts` (5): export → import → replay verified; autosave and restore; storage blocked; read-only share link and report; auto-pause, almanac, settings.
- `space.spec.ts` (4): shade from a tree, roof links, the wizard on Asheville, Laramie vs Asheville HDD.
- `keyboard.spec.ts` (2): the first 15 minutes played keyboard-only; nudging with arrows and visible focus.

**Other checks**
- `npm run lint` (with the engine-purity rules).
- `npm run typecheck`.
- `npm run catalog:check`.
- `npm run build`.
- Screenshots for each session in `docs/screenshots/g0…g8/`.

### Decisions not in the roadmap (creative license)

**Game and presentation**
- The name TERRA Homestead Plugin is in the title, the HUD, and `package.json` (`terra-homestead-plugin`). The workspace packages stay `@homestead/*`.
- The display calendar has four 28-day seasons laid over the engine's real 365-day year. Spring starts Mar 1, summer Jun 1, fall Sep 1, winter Dec 1. Engine math always uses real days.
- Placeholder art is drawn in code: Pixi vector glyphs on the map, SVG in the drawer, one glyph per category, and a baked seasonal grass texture. No third-party assets.
- Flow overlay:
  - Stocks are pooled, so each consumer's receipt is split across producers in proportion to their output.
  - The overlay is capped at 250 links.
  - Consumers with no producer get a dashed red ring.
- The quest card shows one quest at a time, with a progress bar and a status line. Milestones are silent badges with a single toast. Only the largest shortfall's hint shows, and dismissing it silences that resource for 28 days.
- Existing trees are drawn with a 28 ft crown, and terrain features are placed as fractions of the parcel side so they scale with acreage.

**Engine rules**
- Human needs and shelter heating/cooling are `need` inputs. A shortfall hurts health and the checklist but never switches the consumer off.
- Health floor is 0.3, and hardship starts after 3 days below 80% coverage.
- Up to 60% of the day's labor goes to construction first.
- Electricity has `directUseShare` 0.5: half of daytime demand can use solar without a battery.
- Non-storable services (heat, cooling, cooking fuel, transport, sanitation) carry over one day, then spill.
- Food requests are met from any food-family stock, most perishable first. Cold storage slows spoilage by 80%.
- Missing construction materials are imported and logged instead of blocking the build.
- Refunds: 25% for removing a finished system, 100% while it is still under construction.
- Instances are grouped by system, priority, spatial signature, and household scale, which is what makes a 196-instance year run in about 40–55 ms.
- The daily step is split into phase functions so V8 optimizes it (as one function it took about 140 ms per year).

**Catalog overrides and defaults** (all in `data/catalog_overrides.json` or in `docs/CATALOG.md` default rules, with a note on each)
- 26 inputs are marked as boosts.
- Food storage packing densities.
- Distances between footprints are measured edge to edge, not center to center.
- Shade is ×0.9 per source with a floor of 0.7 and stacks. A `once` effect applies a single time however many rules reach it.
- A child counts as 0.6 of an adult.
- Roofs serve rain collectors within 50 ft; paddocks have no distance limit.
- Slope: swales +4% per percent of slope, ponds −3% per percent.

**Saves and sharing**
- The save format is `homestead.save.v1`: seed, action log, progress, and a digest.
- On import, the whole log is replayed and checked against the digest.
- The autosave runs weekly in IndexedDB, and every storage call is wrapped so a blocked storage shows a warning instead of crashing.
- `?design=` opens a layout read only, with "Make a copy to edit". `?new` starts fresh.

**Tooling**
- Packages export TypeScript source directly, so there is no build step for packages.
- Playwright runs one worker, because software WebGL starves parallel browsers.
- The perf test checks the CPU frame budget everywhere and the 60 fps interval only when a hardware GPU is present.
- The year-performance test runs outside Vitest's transform, as an esbuild bundle in a child Node process.
- The session branch `claude/gifted-hypatia-x158zw` holds all sessions, one commit per session, since the cloud session was pinned to it.


---

## G9 — Real weather, scenarios, weather risk (Monte Carlo), sensitivity, exports (2026-09-28)

**Shipped**
- **Real weather (the "90%" model).** `drawYearWeather` draws one set of values per game year from the game's seeded RNG, always 12 draws, so one outcome never shifts the next year's. `docs/ENGINE.md` → Real weather documents every distribution; the constants are in `REAL_WEATHER`.
  - Precipitation: lognormal with mean 1. CV 0.25 on arid sites (under 20 in a year), 0.15 otherwise.
  - Degree days: one warm or cold swing of up to ±8% (HDD down when CDD up).
  - Late frost: 30% of years, delaying the season 21–30 days.
  - Heat waves: 0–2 per summer, 5–10 days each.
  - Hail: 15% of years, taking out a week of growing-season output.
  - Draws are kept in `state.weatherLog`, which is in the save's snapshot and in `gameDigest`. Weather tags (dry year, heat wave, hail, last frost N days late) show in the HUD and the almanac.
  - Average mode draws nothing, so every G2–G8 digest is unchanged.
- **Monte Carlo ("Weather risk").** `monteCarloRun` builds a design, runs it for N years in real weather for one seed, and records per checklist row the worst weekly coverage, hardship months, yearly scores, and rain multipliers. `aggregateMonteCarlo` gives min / P10 / median / P90 / mean and a histogram per row, the chance of any hardship month, and a digest.
  - The app runs it in up to four Web Workers, with seeds dealt round-robin and put back in order, so the worker count can't change the numbers. It has a progress bar and Cancel, which terminates the workers.
  - The CLI is `npm run sim -- montecarlo <design> --site --years --seeds --seed [--json]`.
  - Both print `monteCarloTable` strings, and the app shows the exact CLI command and offers the design file to reproduce its numbers.
- **Design files with layouts.** `designFromGame` / `gameFromDesign`: a design file can carry `parcelAcres` and every placement (position, scale, priority, roof and paddock links). Monte Carlo, scenarios, and the CLI then see the same shade and links as the game. Files without a layout lay out automatically as before.
- **Scenario compare** (Plan → Scenarios): pin up to three designs (Duplicate as scenario, or add a design file), each on any site. Side by side:
  - The average-year ("80%") coverage per row next to the weather-risk "bad week" ("90%", the P10 of worst weeks), and the overall score next to the 1-in-10 year.
  - Purchase cost, cheapest build, labor needed and available, land used, days of stored water and battery, cash per year, and the chance of a hardship month.
  - Every value is `Explained` (click for why). Pinned scenarios persist in localStorage.
- **Sensitivity** (Plan → Sensitivity): a tornado chart of the average-year score with each of the 9 site assumptions at ±20%, largest swing first. Below it, the ten flows whose ±20% moves the weakest row the most, where the weakest row is the one the design provides anything for.
- **Exports** (Plan → Export):
  - The design file.
  - A per-year flow record (`homestead.flow_record.v1`): land by use; monthly electricity bought, made, spilled, peak day, and unmet; water drawn vs used up; food grown, bought, and eaten; fuel by type; spending, cash, and labor; hardship months.
  - Daily ledgers as CSV.
  - A PNG of the map.
  - The CLI adds `run … --flow-record out.json --csv out.csv [--weather real]`.
- **Ledger additions:** `bought` (Flow output of Conventional systems paid in Capital, such as grid power, city water, and groceries) and `hardships` (people entering hardship that day). Neither affects any existing summary or digest.
- New design `designs/rain-fed-yurt.json` (Laramie), a design that lives or dies by the year's rain.
- The HUD has a **Plan** button, and `P` opens the panel. The HUD also shows "real weather" when it's on.

**Tests:** 156 unit at the end of G9 (+23).
- `real-weather.test.ts` (9):
  - Draw statistics over 4,000 years: rain mean ≈ 1, CV ≈ 0.25 arid and 0.15 humid; ±8% degree-days; about 30% late frosts of 21–30 days; heat waves in summer, hail in season.
  - Late frost delays the garden.
  - Average mode leaves the RNG alone.
  - Same seed gives the same weather and digest.
  - Hail zeroes a week of raised-bed harvest.
  - A real-weather game replays to its digest.
- `montecarlo.test.ts` (5):
  - Determinism: running one seed alone equals its place in the batch.
  - The rain-fed design's water spreads in real weather and not at all in average weather.
  - Distribution invariants and quantiles.
  - **The CLI, run as a child process, prints the same table and JSON digest as the engine.**
- `exports.test.ts` (10):
  - Suburban buys grid power and the off-grid cabin buys none; hardship months by name; CSV shape.
  - Layout round-trip including links.
  - Scenario summary equals balance mode; different sites score differently.
  - The tornado ranks sun hours and PV derate first for a solar design; flows are capped at ten; no swing at 0%.

New e2e `decision.spec.ts` (6):
- **The roadmap handoff:** the app runs weather risk (2 years × 6 seeds from seed 11) on a placed layout. The test downloads the design file, runs the CLI command the app shows, and every table cell and the digest match to the digit.
- A 10 × 400 run shows progress and cancels cleanly.
- Two scenarios (one moved to Asheville) show "avg year" and "bad week" together, their numbers explain themselves, and they survive a reload.
- Sensitivity has 9 bars and the flow table.
- All four exports have the right content, and the exported design runs in the CLI.
- A real-weather game from the wizard records two years of different draws.

Screenshots are in `docs/screenshots/g9/`.

**Digests:** none changed.

**Decisions not in the roadmap**
- "Worst-week coverage" per run is the lowest non-overlapping 7-day window over the whole run, the same windows as `summarizeLedgers`.
- A "hardship month" is a calendar month in which anyone entered hardship.
- The scenario view's "90%" number is the P10 of worst weeks, meaning one run in ten does worse.
- Sun hours and wind are not varied in real weather, because the roadmap names no distribution for them.
- Heat waves are modeled as CDD × 2 + 6 per day.
- Monte Carlo runs the design built and mature from day 0 (the question is "does this design hold up", not "can I build it in time"), on 5 acres unless the design file says otherwise.
- The flow record's electricity "export" is surplus that spilled, because no net metering is modeled.
- The app's presets are Quick (3 × 40) and Full (10 × 200, the roadmap's).

**Known gaps**
- A Full run (2,000 simulated years) takes about 1.5 CPU-minutes, spread over at most four workers. Nothing is cached between runs.
- Only the P10 is shown in scenarios, not the whole distribution. The Weather risk tab has the histogram for the current layout only.
- Pinned scenarios live in localStorage, not in save files.

---

## G10 — Performance, resilience, responsive layout, deploy, docs (2026-09-28)

**Shipped**
- **Performance budget, measured.**
  - 500 instances: the perf spec now places 500 instances. Scene work is 0.16 ms and render submission 1.0 ms per frame, so the CPU side fits 60 fps about 14× over. The 60 fps frame interval is asserted only on a hardware GPU.
  - First load: map ready in ~0.4 s here; the e2e budget is 2.5 s.
  - A simulated year through the store takes ~0.1 s (budget 1 s).
  - Lighthouse CI (`lighthouserc.json`, a CI step) asserts FCP and LCP ≤ 2.5 s, accessibility ≥ 0.9, and colour contrast. Run here, with no throttling and software WebGL, it gave FCP ≈ 0.6 s, LCP ≈ 0.6 s, accessibility 1.0, best practices 1.0, and performance ≈ 0.9.
  - Time to Interactive is deliberately not a budget. The map redraws every frame, and on software WebGL those frames are long tasks, so the main thread never goes quiet for 5 s (TTI read 9–25 s). LCP is the honest first-load number for a canvas game.
- **Accessibility fixes from Lighthouse:**
  - A favicon (no console 404), and heading order in the quest card.
  - "Why" buttons and drawer tiles now have accessible names that start with their visible text.
  - The drawer toggle is a 24 px target.
- **Error boundaries** around every region: top bar, drawer, map, status bar, quest card, flow legend, system card, checklist, each panel, plan, notifications, the "why" popover, and the wizard.
  - A crash shows "<Panel> ran into a problem", the message, Try again, Close, and details for a bug report.
  - The clock, map, and saves keep working.
- **Damaged saves.** `saveProblems` / `SaveError` in the engine list everything wrong with a file: not a save, missing fields, an unreadable snapshot, or systems the catalog no longer has.
  - Importing, loading a slot, rewinding, and restoring on start-up all go through `tryLoadSave`. On failure, the game is unchanged and a dialog lists the problems and offers **Load the last good autosave**.
  - Autosave keeps the previous one as `autosave-prev`, only when that one itself passes the checks, so a damaged autosave on start-up falls back to the one before it.
- **Responsive:** under 900 px the drawer becomes a bottom sheet (42% of the height, collapsible to a 26 px handle, full width) with auto-fill tiles. Panels and cards take the full width, and the HUD wraps onto two rows.
- **Deploy:**
  - `.github/workflows/pages.yml` builds and deploys the static game to GitHub Pages on every push to `main` (and on demand).
  - CI uploads the built app as a `preview-build-pr-<n>` artifact on every PR and runs the Lighthouse budget.
  - The build uses relative paths (`base: './'`), so it works under a Pages subpath.
- **Modding handoff:** `packages/catalog/test/modding.test.ts` adds a system (a solar food dehydrator, with three flows) to a copy of the workbook the way `docs/MODDING.md` says, and checks that it exports. `apps/web/src/lib/modding.test.ts` checks that it appears in the drawer's list, search, and category counts, has a card, and places and runs in the engine. No code names it.
- **Docs:**
  - `docs/PLAYING.md`, the player guide: first fifteen minutes, controls, panels, placement, planning tools, saving, settings, weather.
  - `docs/MODDING.md`: add a system, overrides, resources, sites, art, the CLI.
  - `docs/ENGINE.md`: real weather, Monte Carlo, scenarios and exports, damaged saves; corrected the no-battery line.
  - `README.md` links all of these.

**Tests:** 160 unit in 20 files (+4: modding ×3, damaged-save problems). 30 e2e in 9 files.
- New `ship.spec.ts` (4):
  - At 820 × 1180 the drawer is a bottom sheet under the map, a yurt is found, carded, and placed, and the sheet collapses.
  - A damaged report crashes only its panel, while the clock still runs and Close works.
  - An imported damaged save lists its problems ("no daily ledgers", "catalog doesn't have: S999") and loading the last good autosave restores its day.
  - A damaged autosave on reload falls back to `autosave-prev`.
- `perf.spec.ts` is now 500 instances, plus first load and a year of ticks.

Screenshots are in `docs/screenshots/g10/`.

**Git:** the GitHub App was fixed during this run, and `claude/gifted-hypatia-x158zw` pushes now. CI only runs on PRs and `main`, so it has still never run.


---

## Status at the end of the roadmap (G0–G10)

This replaces "Status at the end of the first run" above, which is kept for history.

### Done

| Session | Handoff condition | Met? |
|---|---|---|
| G0 | Workspace, CI, and engine purity lint | Yes (CI has not run on GitHub yet; see "Where to pick up") |
| G1 | `catalog:check` clean; broken fixtures rejected | Yes |
| G2 | Spreadsheet parity to 1e-9 | Yes |
| G3 | Scenarios, conservation, determinism, balance agreement | Yes |
| G4 | Playfield flow and 300 instances | Yes (500 instances since G10) |
| G5 | Every Average-year checklist value equals balance mode; every "why" opens | Yes |
| G6 | Export → import in a fresh browser → replay to the same digest | Yes |
| G7 | Shade, roof links, wizard, site comparison | Yes |
| G8 | First three quests with the keyboard only | Yes |
| G9 | Monte Carlo in-app and CLI agree to the digit; 80% and 90% shown together | Yes |
| G10 | Public URL loads; a new player finishes the tutorial; a system added in the xlsx appears with no code change | **Partly.** The deploy workflow exists but can't run until Pages is enabled and the code is on `main`. The tutorial is covered by `keyboard.spec.ts`. The modding path is covered by tests on a programmatic copy of the workbook, not an edit made in Excel. |

### Half-done or not started

- **Never run on GitHub:** `ci.yml` (typecheck, lint, catalog, unit, e2e, Lighthouse, PR preview artifact) and `pages.yml` (deploy). Everything they run passes in this sandbox.
- **Only measured on software WebGL:** 60 fps at 500 instances. The CPU side is verified; the frame interval is asserted only when a hardware GPU is present.
- **Art:** placeholder vector glyphs only. `sprites/manifest.json` and `manifestEntry` exist, but real images aren't drawn from them yet.
- **Sound:** none. No ambient sound toggle either, since there is no original audio yet.
- **Engine simplifications, documented in ENGINE.md:**
  - One allocation pass a day.
  - A day-long battery buffer.
  - Spatial effects don't ramp with maturity.
  - Sun and wind don't vary in real weather.
  - No net metering.
- **Other smaller gaps:**
  - Share links carry counts, not positions (design files carry positions).
  - Per-instance history is not kept.
  - Pinned scenarios live in localStorage, not in saves.
  - Replay cost grows with game length.
- **Web bundle:** ~1.2 MB (≈257 KB gzipped), most of it the catalog with provenance. The Monte Carlo worker carries its own copy (≈580 KB). FCP and LCP are ~0.6 s here, so it isn't urgent. Splitting provenance out of the web build would be the next step.
- **Accessibility:** Lighthouse accessibility is 1.0 and every flow can be played with the keyboard, but nobody has tested with a screen reader.

### Tests

**Unit (Vitest), 160 tests in 20 files**
- Catalog:
  - `export` (18): templates, defaults, overrides, sync.
  - `validation` (14): mutated copies of the real workbook.
  - `modding` (1): add a system in the workbook.
- Engine:
  - `parity` (9): the spreadsheet goldens.
  - `balance-designs` (6): the designs, their digests, balance performance.
  - `time-scenarios` (18): the roadmap situations.
  - `time-invariants` (9): conservation, balance agreement, determinism, immutability, year performance in a child process.
  - `views` (7).
  - `replay` (4): replay, save round-trip, damaged saves.
  - `report` (3): root-cause chains.
  - `spatial` (10).
  - `kits` (2).
  - `quests` (6).
  - `real-weather` (9).
  - `montecarlo` (5): includes the CLI parity check.
  - `exports` (10): flow record, CSV, layouts, scenarios, sensitivity.
  - `purity` (4) and `version` (1).
- Web:
  - `search` (5).
  - `modding` (2): the new system reaches the drawer and runs.
- Digests: `packages/engine/test/digests.json` (4 balance, 3 time). The time digests were re-recorded once, in G7, for spatial effects; nothing changed in G8–G10.

**End-to-end (Playwright, Chromium with SwiftShader, one worker), 30 tests in 9 files**
- `smoke` (1).
- `playfield` (5).
- `perf` (2): 500 instances; first load and a year of ticks.
- `information` (1).
- `gameloop` (5).
- `space` (4).
- `keyboard` (2).
- `decision` (6): weather risk matches the CLI, cancel, scenarios, sensitivity, exports, real weather.
- `ship` (4): tablet, panel crash, damaged save, damaged autosave.

**Other checks:**
- `npm run lint` (with the engine-purity rules), `npm run typecheck`, `npm run catalog:check`, `npm run build`.
- Lighthouse CI (`lighthouserc.json`).
- Screenshots for each session in `docs/screenshots/g0…g10/`.

**Last verification:** each new G9/G10 spec file passed when run on its own, and so did lint, typecheck, catalog check, build, and all 160 unit tests. The full browser run on a fresh build then passed: **30 of 30 in 5.6 minutes**, with no retries.

### Where to pick up: steps to run on your own machine

The cloud sandbox has no GPU, no screen, no spreadsheet program, and can't change repository settings. These steps need a real machine (Claude Code in a local terminal, or you), roughly in this order:

1. **Open a PR from `claude/gifted-hypatia-x158zw` to `main` and let CI run.** This is the first time `ci.yml` runs on GitHub. Two things to watch:
   - The two timing-sensitive e2e specs (`information`, and `playfield`'s speed test) timed out once under load here and passed on rerun. CI retries once.
   - The Lighthouse step downloads `@lhci/cli` with `npx`.

   Claude Code in the cloud can open the PR and fix CI; that doesn't need your machine.
2. **Enable GitHub Pages** (Settings → Pages → Source: GitHub Actions), then merge to `main`. `pages.yml` deploys, and the public URL is the last G10 handoff item.
3. **Play it in a real browser on a real GPU:** `npm ci && npm run dev`, then open http://localhost:5173.
   - Check the feel (animations, readability, pacing at 1×/3×/10×). So far that has only been judged from screenshots.
   - Run `npx playwright test tests/e2e/perf.spec.ts --headed`. With hardware WebGL it also asserts the 60 fps frame interval at 500 instances.
4. **Lighthouse on a mid laptop:** `npm run build && npx @lhci/cli@0.15.1 autorun`. The 2.5 s first-load budget was measured here without throttling.
5. **Add a system in Excel or LibreOffice** by following `docs/MODDING.md`, then run `npm run catalog:export && npm test && npm run dev`. The tests prove the path programmatically; a real edit with formula recalculation hasn't been done yet.
6. **A full Monte Carlo in the browser** (Plan → Weather risk → Full, 10 × 200). It hasn't been run end to end here (the cancel test starts one and stops it). Expect about 1.5 CPU-minutes spread over the workers.
7. **Tablet and screen reader:** touch (pinch-zoom, the bottom-sheet drawer) on a real tablet, and a VoiceOver or NVDA pass. Only emulated viewports and automated audits have covered these.
8. **Art and audio** need original assets. Wiring `manifestEntry` into `MapScene` sprite creation is a small code task once images exist.

A new cloud session can do the code-only follow-ups: splitting the bundle, drawing art from the manifest, putting pinned scenarios into saves, varying sun and wind in real weather, and a second allocation pass.

---

# Playability roadmap (G11–G16)

`docs/HOMESTEAD_SIM_PLAYABILITY_ROADMAP.md`, written after the first playtest. `CLAUDE.md` gains hard rules 7–9 (actual flows score; new systems via `scripts/catalog_patch.py`; pacing gates in CI) and points at the new roadmap.

## G11 — Truthful accounting: actual vs potential (2026-10-01)

**Shipped**
- **Feasible balance** (`balanceFeasible`). The weekly steady state with curtailment:
  - Satisfactions start at 1 and only decrease.
  - Each pass rations every Flow resource by tier (proportional within a tier, substitutes last) and sets satisfaction to the minimum over required, capacity, and ambient inputs.
  - It converges in 2–10 passes, with a cap of 200.
  - Storage follows time mode as weekly averages: half of electricity demand runs straight off production and the rest must fit through batteries; other stored resources are limited by their pool.
  - Coverage = what consumers received ÷ needed.
  - It returns per-system statuses ("blocked: no Electricity", "partial: 40% of Water"), the pass each one first fell (so chains read in order), and per-row `potential` and `blocked` lists.
- **Potential.** The old function is now `balancePotential` (the spreadsheet; the parity tests and balance digests target it, unchanged). Both functions share `collectTerms`/`assembleBalance`.
- **Delivery.** Heat and Cooling count only when they reach a shelter:
  - The producer is a shelter itself, carried inside one (no footprint), or within 10 ft (heat) or 30 ft (cooling) of one.
  - New engine fields `Resource.deliversTo` / `deliveryRadiusFt` and `System.outdoor` (Firepit, Biochar Kiln Firepit, and Biochar Retort are outdoor).
  - In time mode, undelivered output is recorded as `ResourceDay.undelivered` and nothing can use it.
  - `placeDesign` now puts stoves, fans, and shade trees beside a shelter.
- **Time mode.** Each output's potential is recorded beside its actual (`NeedDay.potential`, `ResourceDay.potential`, `GroupDay.potential`).
- **Views.** The checklist has Actual, Potential, Needed, % covered, and Covered columns in all three modes. A row held back shows "N systems are held back", which expands to each system, its status, and **Find a source of X** (it opens the drawer search for X; G13 replaces this with resource pages). The overall score is actual, with "If every input were met: N%" beside it, in the checklist and as "N% if supplied" in the HUD.
- **Map status bubbles** (Timberborn-style; `instanceStatuses`):
  - A partial system gets a yellow bubble; a blocked one gets a red bubble with a slash.
  - Each bubble carries an original vector glyph for the missing input (bolt, drop, log, flame, leaf, clock…), drawn at a constant screen size.
  - The map tooltip says why. `B` and Settings toggle the bubbles; running systems show nothing.
- **Bug fixed:** spatial output multipliers from G7 (chickens by the compost, trees near a turbine, swales on a slope) applied only to capacity outputs in time mode. They now multiply flows.

**Tests:** `truthful.test.ts` (10):
- **GoSun Fan + Bell Tent + Human, no power:** cooling actual 0, potential above 0, "blocked: no Electricity". Time mode agrees in July.
- **Removing the panels:** the well stops in pass 1 and the beds in pass 2; water and food drop while potential stays.
- **Convergence:** the solver settles and satisfactions never rise.
- **Delivery:** a firepit's heat is potential only; a stove beside the tent counts and the same stove 120 ft away doesn't, in both modes.
- **HUD score:** equals the feasible score, with potential ≥ actual.
- **Agreement:** feasible matches time-mode year-2 overall coverage within 5 points for the starter, off-grid cabin, and suburban designs. Starter rows match within 5 points, except one documented seasonal effect: trees drop autumn leaves after their summer water need ends.

The unlimited-supply agreement now compares time-mode **potential** with `balancePotential`. e2e `truthful.spec.ts` (3): the fan drill-down and Find a source, map bubbles and `B`, and the HUD potential. Screenshots are in `docs/screenshots/g11/`.

**Digests:** balance (potential) and spreadsheet goldens are unchanged. Time digests were re-recorded (delivery, the output-multiplier fix, auto-layout, and new ledger fields), and again in G12.

**Decisions not in the roadmap**
- Coverage % is what consumers received ÷ needed, not actual made ÷ needed, so a panel whose power spills for lack of a battery doesn't count twice. Actual (made) is still the column beside it.
- A count-only design (no layout) assumes heat and cooling are delivered, unless it has no shelter or the producer is outdoor.
- Ambient inputs in balance mode are met by the site (`design.ambient`, from the game) or by a system in the design that outputs them (the spreadsheet's Sunlight and Rainfall systems).
- Bubbles appear only on systems with a footprint (a fan or a utility hookup has none to put one on); the checklist drill-down lists them all.

## G12 — Market, backstops, self-reliance, weekly bills (2026-10-01)

**Shipped**
- **Market:**
  - 15 priced resources (roadmap table; low confidence, flagged in CATALOG.md with the proposal to move them into the xlsx). Electricity is not sold.
  - **Buy now** orders for the next trip, and **standing orders** ("keep firewood above 150 lbs", buying up to 1.5×). Both are actions (`buy`, `standing`) that replay.
  - One trip a day covers all orders, using 10 miles of transport or a $25 delivery charge.
  - Partial fills when cash runs short; nothing is bought at or below zero cash, with a `purchases-stopped` event and toast.
- **Backstops:**
  - The grocery store, factory-farmed food, the power plant, city water, the gas station, and the feed store fill whatever on-site supply didn't. Each one serves up to 3× its catalog output, at a per-unit price, plus a connection fee whether used or not (grid $3/week, city water $5/week).
  - Their Capital input becomes those charges; by-products follow what was delivered.
  - Deliveries are `purchased`, recorded separately from on-site `produced`.
  - Feasible balance tops up unmet demand the same way and reports bills.
- **Self-reliance:** per row and overall (coverage × share made at home, labor left out), in time mode and feasible balance. The checklist shows a "Made at home" column and the overall figure.
- **Market and bills panel** (`M`, HUD "Market"): this week's bills with the 12-week trend and a line per item (sparklines); a buy table with price, stock, days it lasts, buy-now, and keep-above.
- **Exports** stay correct: the flow record's bought vs made-on-site now accounts for `purchased`.
- **Toasts:** at most three, with repeats replacing their earlier copy, shown at the bottom so they never cover a panel. My earlier notes said this was already done; it wasn't.

**Tests:** 181 unit across 23 files (+11).
- `market.test.ts` (10): full coverage at full price.
- **Roadmap check:** four raised beds and a 6 kW array cut the grocery and grid bills by exactly vegetables eaten × price and solar used × price, within half a cent.
- `market.test.ts`, more checks:
  - Zero cash stops every purchase and logs it.
  - Connection fees, the bills view, buy-now with trip or delivery, and standing orders.
  - Electricity can't be bought, and market actions replay.
  - Feasible balance fills food from the grocery and prices it.
- `sources.audit.test.ts` (1, the **handoff**): every Flow input can be made, gathered, or bought. The warnings for inputs with a single source are printed: chicken feed, gasoline, propane, waste lumber, and wood pellets are market-only; coffee grounds, grain, root crops, and wood chips have one producer.
- The no-cash scenario was rewritten for backstops.
- e2e `market.spec.ts` (2): buy, standing order, bills lines, and the action log; the self-reliance column. Screenshots are in `docs/screenshots/g12/`.

**Digests:** time digests re-recorded (backstop dispatch and summary self-reliance fields). Potential balance and goldens are unchanged.

**Decisions not in the roadmap**
- Backstop price = market price where one exists. The grid and city water get explicit prices tuned to roughly their catalog weekly bills.
- When several backstops sell the same thing, the cheapest is served first.
- Market orders arrive the morning of the trip, and a standing order buys up to 1.5 × its threshold by default.
- Market purchases count as "bought" for self-reliance even after they sit in stock.
- The suburban design's groceries and job get no transport. People (tier 0) use the two cars' 500 miles a week first, which is a real shortfall in that design, not a bug; the G15 adapt start sizes for it.

**Known gaps:** feasible balance doesn't model market purchases (they are player actions, not steady state).

## G13 — Where does this come from? (2026-10-01)

**Shipped**
- **Resource pages:** a side sheet with an address, `#/resource/<name>`.
  - What the resource is, stock, storage room, spoilage, and a 12-week made / bought / used chart.
  - **Where it comes from:** in your design (actual and potential output, and what holds each producer back); on your land (G14 nodes); you could build (cheapest per unit first, conventional last, each input marked ✓ have / ✗ missing and linking to its own page); buy (market price and a buy box, or "the market doesn't sell Electricity: it comes only through a grid connection").
  - **Where it goes:** consumers in the design (gets N of M a week), catalog systems that use it, and what happens to the unused rest.
- **Click-through everywhere:**
  - Every System Card input and output, every checklist row name (heat and cooling rows open Heat and Cooling), and every drawer Inputs/Outputs entry open the resource page.
  - So does every shortage toast ("Where from?") and the held-back list's "Find a source of X".
  - Every system named on a page opens its card.
  - A **back stack**: the ← on pages and cards, or Backspace when one is open with history. Backspace deletes the selection otherwise, and Delete always does.
- **Status line** on the System Card: "Blocked: no Electricity · Electricity", linking to the missing input.
- **Supply-chain tree** (Show supply chain): inputs → producers → their inputs, three levels; covered branches are green and collapsed, short ones amber and open.
- **Build plans:**
  - "Plan this branch" adds the cheapest producers of every unmet input as ghosts on the map: translucent, with a dashed outline, laid out near the system without overlapping each other.
  - A Build plan card shows the total cost and setup labor; build one at a time or Build all, remove items, or Clear.
- **Search by resource:** the drawer's Anything / Makes it / Uses it toggle. "wood pellets" + Uses lists the Pellet Stove; + Makes lists the Farm & Feed Store. The pellet mill arrives in G15.
- Toasts moved to the bottom-left so they don't cover cards and pages.

**Tests:** 185 unit.
- `resource.test.ts` (3): an electricity page with producers, users, and build options; wood pellets with the market and an input you lack; a well's chain with electricity unmet and sunlight covered.
- `search.test.ts`: makes / uses separates sellers from burners.

e2e `sources.spec.ts` (4):
- **The handoff:** from five blocked systems (well, wood stove, pellet stove, chicken coop, composting outhouse), the card (click 1), the missing input in its status line (click 2), and a source's card ready to Add (click 3), with something to build or buy on every page.
- Card → resource → card and back with Backspace, with the URL hash.
- The well's chain → Plan this branch → ghosts → Build all.
- A deep link to `#/resource/Wood%20pellets` and the makes / uses search.

Screenshots are in `docs/screenshots/g13/`.

**Decisions not in the roadmap**
- The page's "spare capacity" is shown as headroom: what a producer could add if its own inputs were met. A resource's surplus already shows as spilled, under Outputs.
- "Sell" isn't modeled (there is no buyer in the engine), so "Where it goes" ends with what happens to the unused rest: spills, spoils, or piles up.
- The pellet-stove walk the roadmap describes (pellet stove → Wood pellets → pellet mill → its wood-chip input → plan) needs the G15 pellet mill. It is in G15's e2e.

## G14 — The land provides: gathering (2026-10-01)

**Shipped**
- **Natural nodes** as site data (`nodes` in `data/sites/*.json`, validated by `SiteSchema`): deadfall, creek, spring, wild greens, berry thicket, clay bank, leaf litter, and rain pools. Each node has a stock, regrowth, a season, by-products, an untreated-water flag, rain fill, and drought sensitivity. Asheville is wood- and creek-rich; Laramie has little wood and a weak spring.
- **Jobs and the work panel** (J, or the HUD's Work button):
  - seven jobs, each with a 1–5 priority and a weekly hour cap;
  - labor goes by priority, then proportionally; "last week" hours per job;
  - every job's hours land in `ledger.labor.byJob`.
- **Auto-gather rules:** keep water above N days, firewood above N weeks, and food above N weeks. These are editable in the Work panel and off by default; G15's greenfield start turns them on. Each rule restocks at most 2 days of use per day and takes at most 40% of the day's labor.
- **Gathering:** the nearest node is worked first; walking costs labor (1 min per 50 ft each way per trip). By-products come along, stocks deplete and regrow, and drought cuts creek and spring yields (floor 20%) in real-weather mode.
- **Boiling:** with no filter, untreated water is boiled over the cooking fire (4 gal per fuel-hour, 0.05 h labor per gal).
- **Map:** nodes draw as original sprites (log piles, a water line, bushes, a clay patch, leaves, puddles) that shrink as they deplete. Hovering shows the stock, yield, distance, and season. A resource page's "On your land" entries focus the node.
- **Why:** the checklist notes gathering, for example "Drinking water: 6.2 gal from the spring via boiling, 0.3 h labor", and "Woody biomass: 40 lbs from deadfall, 1.2 h labor (0.2 walking)".

**Tests:** 190 unit (`gather.test.ts`, 5).
- A tent camp with a tiny stove lives off the spring and the deadfall for a spring month on the Front Range, by auto-gather alone: no hardship, drinking water and heat never short of wood.
- A creek yields less in a drought year.
- Gathering competes with construction through priorities.
- A weekly cap holds a job to its hours, and a cap alone sets standing hours.
- Deadfall regrows slowly; untouched nodes aren't tracked.

e2e `gather.spec.ts` (1): work priorities, auto-gather on, a season passes, depleted nodes on the map, and the "why" mentions gathering. Screenshots are in `docs/screenshots/g14/`.

**Digests:**
- `time:starter` and `time:offgrid-cabin-family` re-recorded. The labor refactor moved a sum by 3.7e‑14 gal (floating-point reordering); no behavior changed, because those designs have no auto-gather.
- Balance digests and goldens are unchanged.

**Decisions not in the roadmap**
- The Firepit is `outdoor` (G11), so it never heats a tent. The roadmap's "tent and firepit" test uses the catalog's Tiny Wood Stove for heat, and asserts the stove is never short of wood. The catalog's stove is too small to fully heat a canvas tent on April nights, and that is a catalog fact.
- Both the 40% labor cap and the 2-day restock limit exist because, without them, food foraging at priority 1 starved upkeep and the camp's systems decayed.
- The water rule counts both Water and Drinking water. Boiling only happens when no system in the design turns Water into Drinking water.
- There is no "market trip" job: G12's daily trip costs transport, not labor. Each system's upkeep is one "Look after systems" job rather than one job per system, to keep the panel short.
- Gathered food is Vegetables fruit fiber herbs, which counts toward Food through the existing factor.
- Rain pools fill at 150 gal per inch of rain on a 200 gal cap and evaporate 25% a day.

## G15 — Two ways to start (2026-10-01)

**Shipped**
- **Start screen.** Two cards, "Adapt your home" and "Start from the ground up". Each previews its kit, stockpile, cash, and land. Below them: site, household (adults), and difficulty (Gentle, Standard, Real weather). The old form is still there as "Custom game…".
- **Start configs as data:** `data/starts/adapt.json` and `greenfield.json`, validated by `StartSchema`, built by `gameFromStart`, and replayable (`init.start`).
  - Adapt: every row is 100% on day 1, and self-reliance and weekly bills lead the HUD.
  - Greenfield: the full starter kit, with auto-gather on.
- **Wellbeing v2** (`time/wellbeing.ts`, ENGINE.md "Wellbeing v2"):
  - grace periods and drift;
  - recovery, with no day costing more than 8 points;
  - labor = 0.5 + 0.5 × wellbeing;
  - going to town and coming back;
  - each person's terms kept as `why`.
- **People bar and stockpile bar** under the HUD.
  - Each person has a wellbeing bar, the top reason it is moving, and a "why" that lists every term.
  - Days of food, drinking water, firewood, and battery, each with a trend arrow and red under 3 days. Every number has a "why".
- **Catalog additions as xlsx rows**, via the new `scripts/catalog_patch.py` (8 systems, 21 flows).
  - The diff summary is `docs/catalog_patches/g15-diff.md`: 0 existing typed values changed.
  - The exported catalog and goldens are purely additive: all 168 old systems and 797 old flows are identical, and only the source hash changed.
- **`modifies` overrides** (host and parcel scope) for the weatherization retrofit (house heat × 0.7) and the clothesline (people's electricity × 20/21).
- The G13 pellet walk now works end to end: pellet stove → Wood pellets → the market and the Pellet Mill → its Wood chips → a planned branch.

**Tests:** 211 unit, of which 21 are new in `starts.test.ts`:
- the adapt and greenfield pacing gates on 3 sites;
- Gentle;
- spring start days and household scaling;
- going to town and coming home;
- grace, drift, and recovery;
- the retrofit, the clothesline, and the rain barrel.

e2e `starts.spec.ts` (3): the greenfield start with the stockpile and wellbeing "why"; adapt with the HUD headline and every row covered after two weeks; the pellet walk. Four older specs were updated:
- the wizard tests go through "Custom game…";
- the truthful "find a source" test now expects the resource page (G13);
- the drawer's makes/uses toggle moved above the search box, with a roving tabindex, so Tab from search reaches the first tile again (keyboard spec).

Screenshots are in `docs/screenshots/g15/`.

**Digests:** the time digests were re-recorded, because wellbeing replaced health and labor now follows it (0.5–1 instead of 0.3–1). Balance digests and goldens are unchanged.

**Decisions not in the roadmap** (see `docs/BALANCE_LOG.md` for the numbers)
- **Going to town is a setting** (`peopleLeave`). It is on in both starts. Design analysis keeps a fixed household, because a household that empties would make validation and Monte Carlo meaningless.
- **Heat and bedding:** clothes and bedding cover the first 20 °F-days of cold a day. Without this, the catalog's tiny stove (about 25% of a wall tent's heat loss) would make every spring start a hardship.
- **Greenfield food is 200,000 kcal**, because the roadmap's "600,000 kcal" and "3 weeks" disagree. Seed potatoes are omitted (no catalog resource).
- **"Spring, day 1"** is 30 days before each site's last frost.
- **Adapt has two cars and the gas station**, and its backstops may fill 8× their catalog output, so January heat comes from the grid.
- **The start "eve":** one silent day before day 1, so the house's sanitation and the cars' miles count on day 1. Only flows carry over: no cash, no stock draw.
- **The Rain Barrel has its own 100 sq ft catchment** (no Roofing area input), so a tent camp can fill it.
- **Sheet-mulch Soil is per season.** A one-time output would count as nothing in the weekly model.
- **The retrofit carries a token Labor 0.05/week.** A system with no flows isn't valid in the sheet.
- **The clothesline's "home electricity −2 kWh/week"** is 1 kWh per person, because the catalog's home has no electricity input; people do.
- The old tutorial quests still show in both starts. G16 replaces them with the greenfield and adapt tutorials.

**For the user to check**
- Open `data/source/LandLab_Sim_Systems_v2.xlsx` in Excel. The 8 new rows are at Systems 170–177, Flows 799–819, and Matrix 170–177. The summary is in `docs/catalog_patches/g15-diff.md`. The Shelter category now counts 21 systems, so its "Within target?" cell reads No (the retrofit carries the Shelter tag).

## G16 — Tutorials and pacing gates (2026-10-01)

**Shipped**
- **Quest lines as data** (`data/quests/greenfield.json`, `adapt.json`): 8 quests each, in the roadmap's order and words. Each has a goal, the cheapest steps, a "show me" target, the checklist row it moves, and a neighbor's reward (Ruth on the next ridge; Dale across the street).
  - The engine evaluates goals (`tutorial.ts`) and pays rewards at the end of the day, inside `stepDay`, so tutorials replay exactly.
- **Quest card:** pinned, with progress, the goal's detail line, **Show me** (opens the drawer item and its card, focuses a node, opens a resource page, or opens a panel), the reward's sender, and Skip (a logged action). Opening the Market panel completes "Read your weekly bills". Quest-done toasts carry the neighbor's line.
- **Bots** (`packages/cli/bots/`): idle, tutorialFollower, greedy, adaptUpgrader, plus `playBot`.
- **Pacing gates:** all 5 of the roadmap's gates on 3 sites × 3 seeds, in three places:
  - a Vitest suite;
  - `npm run test:pacing` (a table, exit 1 on a miss);
  - a **separate CI job**, "Pacing gates (playtest bots)".
  - All 45 runs take about 3 seconds.
- **The tuning loop**, recorded change by change with results in `docs/BALANCE_LOG.md`. It found four engine bugs, now fixed:
  - upkeep starved by construction;
  - Flow boosts always 0;
  - seed potatoes eaten;
  - running costs missing from the bills.

**Tests:** 218 unit tests, including 7 pacing tests: the 5 gates, bot determinism, and the greedy bot. Full e2e suite: 44 of 44 pass.

e2e `tutorial.spec.ts` (1): the first five greenfield quests through the UI, with Show me, the Work panel, the market, and placing. Screenshots are in `docs/screenshots/g16/`. Two G14/G12 unit tests were updated for the new upkeep priority and running costs.

**Digests:** the time digests were re-recorded, for upkeep priority 1 (`time:suburban-baseline`) and Flow boosts (`time:starter`, `time:offgrid-cabin-family`). The seed reserve and the running-costs bills changed no digest. Balance digests and goldens are unchanged.
*(Corrected 2026-10-02: this line first said the seed reserve also changed digests. Reverting each fix alone shows it didn't; see `packages/engine/test/DIGESTS.md`.)*

**Decisions not in the roadmap**
- **"Survives year 1"** = nobody goes to town during the year.
- **"At least one food row ≥ 25% actual by autumn"** = home-grown food eaten (not bought) is at least 25% of the household's need over some 30-day window that ends by the site's first fall frost. Bought food would make "actual" trivially 100%.
- **"Bills fall ≥ 20%"** compares the average week of weeks 2–5 with the last 4 weeks of the year.
- **Rewards land at the end of a day**, as part of the engine state, not as UI actions. A bot and a player get identical rewards, and replays match.
- **The greedy bot** ranks by cost per unit of the worst row's weekly output and skips anything costing more than half its cash. It has no gate; the roadmap gives it none.
- **Old games keep the old quest line.** The G8 quests still run for custom games; only games from a start use the new lines.

## Status at the end of the playability roadmap (G11–G16)

All six sessions are done and pushed to `claude/gifted-hypatia-x158zw`, with no irreconcilable snags. The roadmap's "What to check when it comes back":
- [x] The GoSun Fan test exists and passes (`truthful.test.ts`, `truthful.spec.ts`), and no checklist path calls `balancePotential` (only `balance/` and parity tests do).
- [x] Spreadsheet goldens are untouched. Parity targets `balancePotential`. The G15 patch changed only the source hash and added 21 flow entries.
- [x] The xlsx diff from `catalog_patch.py` adds rows only: `docs/catalog_patches/g15-diff.md`, 0 typed values changed.
- [x] Pacing gates are real CI jobs, not skipped. `BALANCE_LOG.md` shows each tuned number and why.
- [ ] **Greenfield idle at 1× in the browser:** count the days to the first hardship toast. The engine says day 53–54 on every site (the gate wants ≥ 28). Worth a look by eye.

### Where to pick up locally
1. **Review the workbook in Excel** (`data/source/LandLab_Sim_Systems_v2.xlsx`): Systems 170–177, Flows 799–819, Matrix 170–177. Re-running the patch script needs `pip install openpyxl` and LibreOffice Calc.
2. **Play both starts for real.** The bots prove the gates, not the fun. The open questions are in `BALANCE_LOG.md`:
   - Real weather currently survives 9 of 9 seeds;
   - camps settle around wellbeing 80.
3. **Run the full suites on your machine:** `npm test`, `npm run test:pacing`, and `npm run test:e2e`. CI runs them all; the pacing job is separate and fast.
4. Open the PR when you're happy. This branch carries G11–G16. Per CLAUDE.md's "one session = one branch", you may prefer to split it.

## Audit — G11–G16 verification (2026-10-01)

**Shipped:** no features, no tuning. Full report: `docs/AUDIT_G11_G16.md`.
- `catalog:check` needs no LibreOffice or Python: it passes in a fresh clone after only `npm ci`, with neither on PATH. `docs/CATALOG.md` now says the patch script is run by hand only.
- Digest history and per-fix attribution are in `packages/engine/test/DIGESTS.md`. History was not rewritten (the branch is pushed).
  - Upkeep priority moved `time:suburban-baseline`.
  - Flow boosts moved `time:starter` and `time:offgrid-cabin-family`.
  - The seed reserve and running-costs fixes moved none.
- Goldens: existing entries are identical to before G11. The file changed only by the xlsx hash and 21 added flows.
- Workbook:
  - A LibreOffice recalculation reproduces every cached formula value (7,094 cells), the 48.5% overall score, and the checklist goldens.
  - The G15 patch changed 0 typed values. 872 formulas were changed only by extending range ends from row 169 to 177.

**Tests (fresh clone):** 218/218 unit, all pacing gates, typecheck and lint clean. e2e was not rerun.

**Digests:** unchanged.

**Known gaps:** see the report's "Found, not fixed" section and its open bedding question.

## Review follow-ups on PR 1 (2026-10-02)

Four changes, each in its own commit.

1. **The retrofit is tagged Heating only** (`g16a-retrofit-heating`). Shelter is back to 20 systems and "Within target?" reads Yes. `catalog_patch.py` gained text-only `edits` (never a number column). Goldens: only the source hash changed.
2. **The Systems R validation and the Matrix highlighting cover every row** (`g16b-table-formats`). They now reach R2:R177 and B2:BK177, and the patch script stretches them on every future patch (the blankets patch took them to 178).
   - Styling, checked cell by cell against the file before: only those two ranges changed.
   - Against the pre-G15 original, the G15 save left 61 custom row heights rounded to LibreOffice's 0.75 pt grid, and one extra cell format (5 added Flows notes cells say "wrap off" explicitly). Nothing else differs.
3. **Corrected the G16 entry's digest line.** The seed reserve changed no digest.
4. **Wool Blankets & Sleeping Bags replace `HEAT_BEDDING_HDD`** (S177, `g16c-wool-blankets`).
   - It is a host modifier on the shelter's Heat request, × 0.2, and is in the greenfield kit.
   - The checklist, the people bar, and the "warm" quest goal all use the shelter's own heat need. Both "why" popovers name the blankets.
   - Wellbeing's threshold test gained a 1e-9 tolerance. It was a latent float bug that this change exposed.
   - Pacing is identical to "baseline plus the tolerance fix" on every measure. The full before/after table and the multiplier scan are in `BALANCE_LOG.md`, along with a caveat: under a constant multiplier, winter in a tent is easier than under the old offset.
   - Time digests were re-recorded (`DIGESTS.md`).

**Also: CI was red on the PR.** The `check` job's one-year performance budget (200 instances, under 150 ms) read 161 ms on the runner.
- On an idle CPU here, the bench grew from about 65 ms at the end of G10 to about 92 ms by G16; the runner is about 1.8× slower. A profile diff put the growth in two places:
  - the spatial cache check rebuilt a string of every instance each day;
  - wellbeing ran once per person.
- Both are fixed without changing any result: the layout fields are compared in place, and an update is reused for the next person in an identical state. The bench is now about 60 ms. Digests and pacing are unchanged.

**Tests:**
- 222 unit tests, including 4 new blanket tests: the need cut, one heat need for the checklist and the people bar, blankets stacking with a retrofit, and blankets in the kit.
- Pacing: 15 of 15 gate groups pass.
- e2e: 44 of 44 pass. `starts.spec` now checks that the wellbeing "why" names the blankets.

**Digests:** time digests were re-recorded once, for the removal of the bedding constant (`DIGESTS.md`). The performance commit changed none.

**Known gaps:** winter in a tent with blankets is easier than under the old offset. See `BALANCE_LOG.md`, "What the gates don't show".

**Then a second CI fix (`2a7c9e9`).** With the unit step passing, CI reached Lighthouse, which failed `color-contrast`: the red stockpile chip from G15 was #e0523d on the panel, 3.76:1. A `--bad-text` token (#ff8a75, 6.3:1; the colorblind palette gets #ffb066) is now used for red text. CI is green on `2a7c9e9`.


## Playtest follow-up — Phase 0 and Phase 1 (2026-10-16)

Work isolated from the original local server in branch `codex/phase-0-1`; imported source snapshot is `60fad89`. This is a local extracted-source repository, not a push to the upstream GitHub branch.

**Phase 0:** traced live/forecast accounting, food substitution/reservations, construction, work allocation, town return, sensitivity and report persistence. Exported the actual day-57 and day-240 playtest saves into compact replay fixtures. Audit and classifications: `docs/PHASE_0_1.md`. A replay utility is available as `node --import tsx scripts/replay-playtest.ts <fixture.json> [absolute-day]`.

**Phase 1:** current ledger-based coverage is the default; completed and planned annual forecasts are explicit. Planned forecasts include completed spatial effects; unfinished systems never improve measured history. Food runway excludes seed reserves and direct food uses, with explanations. Work warns when reserve targets exceed completed pooled water storage. HUD and Work share worked/available/idle accounting and employment/maintenance/gathering/construction detail. Cards distinguish previews and operating measurements, show no unfinished output and retain one-time material fulfillment. Capacity labels and floating-point formatting are corrected. Sensitivity receives the same complete design inputs as the planned forecast.

**Validation:** 239 unit tests pass (17 added), typecheck/lint/build/catalog:check pass; all 15 pacing groups pass. Full browser run: 44/46 pass. Tablet drawer-collapse and outhouse-map-card failures reproduce on unchanged snapshot `60fad89` in a detached baseline worktree; no tests were skipped or weakened. Affected browser suite: 11/11 pass, including new fixture-based UI regressions. Screenshots: `docs/screenshots/phase-1/`.

**Digests:** day-57 `9544bdc2fdf7f9cf`, day-240 `f90dc93c4f4d1a4a`; existing simulation digests unchanged. No catalog quantities, prices, rewards, wellbeing or town logic, goldens, or save schema changed.

**Next:** Phase 2 recovery and survival-priority guidance. Confirmed town heat-return and report health/persistence findings are documented, not changed in this patch.

## Playtest follow-up — Phase 2 (2026-10-16)

Continued on `codex/phase-0-1` after `17a17a3`. No push or upstream PR.

**LL-04:** Work exposes the construction queue, remaining work, simulated finish forecasts and competing commitments. Emergency construction takes resident labor before employment/fetching/upkeep and overrides the normal construction cap/share. Prepaid outside crews cost $35/h and supply 8 h/project/day, with exact insufficient-cash explanations and refunds for unworked hours. Crew purchases are replay actions. Safer town return checks the whole household's shelter and prepared reserves, then trials its operating survival needs with employment and gathering contention. One arrival day restarts daily services, followed by three checked days. Work and the people bar expose recovery requirements.

**LL-05:** immediate survival warnings precede weekly design advice; town recovery precedes comfort/independence gaps. Alerts group affected residents and show grace deadlines, supply consequences and actions. Hot-weather cooling and low Carbon/feed reserves are surfaced. Historical reports distinguish resident wellbeing from labor factor, state the day range and exclude empty-home days.

**LL-06:** Show me prefers owned operating systems. Gathering guidance explains work caps/rules. Water automation promises configuration, explicitly not a proved reserve. Early stabilization/winter guidance is independent of late quest progress. Rewards show amounts and identify assistance. Quest ordering, IDs, goals, rewards and catalog quantities are unchanged.

**Compatibility:** engine `0.2.0`, same save schema. Historic logs without `safeRecovery` preserve legacy return semantics and both recorded digests. New UI games enable the safer policy; loading an older save appends a settings action at continuation, after original replay verification. Read-only loads do not migrate. Crew actions replay deterministically. No existing tests were removed or weakened; the browser tutorial's two title references changed to the corrected wording and gained reserve/assistance assertions.

**Validation:** 256/256 unit tests pass (17 added). Typecheck, lint, build and catalog:check pass. All 15 existing pacing gate groups pass; the new policy independently passes all 15 groups on the same three sites × three seeds. Full browser sweep initially passed 46/49; its tutorial title/progression mismatch was corrected and the entire five-quest scenario passed on rerun. All three new recovery browser scenarios pass on the final build, alongside the prior accounting/start regressions. The two remaining browser failures are the tablet drawer-collapse and outhouse map-card scenarios reproduced against imported baseline `60fad89` during Phase 0/1; their assertions remain intact. Thus 47 of 49 browser scenarios have passing results, with those two baseline failures still open.

**Release replay:** actual day-240 fixture starts with $10,828.94 and zero resident labor. Stalled heaters quote $247.05 / one day and $2,100 / eight days. Paid crews, system maintenance ahead of gathering, and recurring fuel/Carbon/food orders bring both residents home; after 30 days both remain above 50 wellbeing while the remote job remains and is worked. An unchanged cold continuation does not return residents over the following 21 days. Full policy, balance rationale, limits and screenshots: `docs/PHASE_2.md`; initial parameters are also in `BALANCE_LOG.md`.

**Digests:** legacy spring `9544bdc2fdf7f9cf`, winter `f90dc93c4f4d1a4a`; no re-recorded goldens or fixtures. The explicit safer-policy settings action intentionally changes continued-game digests.

**Next:** Phase 3 project previews and placement. Queue-wide emergency priority retains placement order. The short return trial does not guarantee long-term fuel/cash sufficiency; outside crew pricing is initial tuning. Report reconstruction after loading remains outside this phase.

## Playtest follow-up — Phase 3 (2026-10-16)

Continued on `codex/phase-0-1` after `bdb5fb4`, local only.

**LL-07:** catalog cards preview selected-mode purchase/cash balance, setup and simulated finish, optional outside-crew price/duration/cash after both, one-time materials, recurring inputs and money demand, maturity, net demand changes, cold-day heat gap and nominal food calories per adult equivalent. Food timing distinguishes daily growing-season/window output from the event announcing the window. Unused shelters still request heat; the preview explains that verified model rule rather than introducing occupancy balance changes.

**LL-08:** placement and drag overlays draw relevant ranges and targets, show overlap validation separately from operating reach, warn without blocking intentional unconnected plans, and explain footprint-edge distances. Near-cutoff text uses inequalities/margins. Host/parcel rules are labeled appropriately. Moves preserve capacity allocation order and group checks include each selected footprint. The selected-system spatial graphics layer is now attached to the scene.

**LL-09:** Scenarios and Sensitivity share a reconstructed planned-layout annual baseline. Scenario setup effort complements capital and ongoing labor requirements. Sensitivity shows useful precision, percentage-point deltas and inactive-vs-score-unchanged distinctions. Weather risk identifies its fresh reserves, cash and operating policies, marks stale layout snapshots and explains its daily-model differences. A separate Next 90 days forecast preserves the live save's reserves, work, employment, orders, construction, maturity, assistance and town policy.

**Required correctness fix:** full-state preview tests exposed `nodeStock` aliasing in daily gathering. `git blame` identifies baseline `60fad89`, original `time/step.ts:1326`. Copy the map before gathering so forecasts, prior states and Phase 2 return trials do not consume live natural-node reserves. Engine bumped to `0.3.0`; schema unchanged. This is state isolation, not a balance-constant change.

**Validation:** 269/269 unit tests (13 added), typecheck, lint, build and catalog:check pass. All 15 legacy pacing groups and all 15 safer-policy groups pass across three sites × three seeds. Full browser sweep: 51/53 pass, including the four new Phase 3 flows. The two failures are the tablet drawer-collapse and outhouse map-card scenarios previously reproduced against imported baseline `60fad89`; their assertions remain intact. Final targeted rerun: 6/6 pass, covering all four Phase 3 flows plus both unchanged keyboard scenarios after the capacity, daily-rate/percentage and card-focus adjustments. Browser CLI/Monte Carlo agreement, existing planning/export scenarios, Phase 1 accounting and Phase 2 recovery pass.

**Release example:** spring fixture starts at $7,784. A $6,000 DIY yurt leaves $1,784, or $384 after a five-day $1,400 crew; its new heat demand is visible before placement. A heater's $600 purchase plus $2,100/eight-day crew is disclosed before commitment; browser test checks reach, purchases it, books the crew, verifies $5,084 remaining, and completes it in eight days. The bed and coop previews respectively show roughly 3.7 and 275 kcal/adult/day with full inputs and maturity, rather than implying food independence.

**Digests:** historic spring `9544bdc2fdf7f9cf` and winter `f90dc93c4f4d1a4a` remain unchanged. No fixture/golden updates, new dependencies, catalog quantities, startup resources, rewards or wellbeing threshold changes. Report, limitations and screenshots: `docs/PHASE_3.md`.

**Next:** Phase 4 controlled strategy and balance evaluation. Annual mature ceilings remain distinct from actual-state survival forecasts. Empty-shelter heating, material imports, default weather-risk reserves, sample-position assumptions and the bounded forecast horizon are explicitly described for review.

## First implementation batch — items 4, 5 and 6 (2026-10-22)

Continued on `codex/phase-0-1` after `65249bf`, local only. Most of items 4 (LL-05/LL-06), 5 (LL-08) and 6 (LL-04) shipped in Phases 2–3; this closes the remaining gaps.

**Item 4 — early consumable warnings:** the low-reserve alert now covers every storable, buyable, non-survival input (fuel, seed, seedlings, hay, compost, soil, pellets, gasoline/propane), not only Carbon and Chicken feed. It looks `CONSUMABLE_WARN_DAYS` (7) ahead with today's weather then average climate, so seed warns before the growing season and heating fuel before cold. Demand is net of yesterday's on-site production; resources an active usage-priced backstop tops up are skipped (cash runway covers those). Detail names the consuming systems; alerts sort by days on hand. Water quest wording was already corrected in Phase 2. Pantry/food runway stays with item 2.

**Item 5 — boundary text:** the heater note and capacity-link notes now say the distance is an edge-to-edge gap, the heater note says how to fix it, and an exact-limit distance reads `= N ft limit (in range)`. Existing `> / <` margin text is unchanged.

**Item 6 — finite zero-labor recovery route:** `recoveryRoute` (engine, `views/recovery.ts`) turns the Phase 2 pieces into one route for a household in town: prepaid crews for unfinished projects that restore a survival row (cheapest first while cash lasts; unfunded crews state the exact missing amount), upkeep ahead of gathering, and a standing order for each bought survival or consumable input that lacks one (7 days of use, 3 for drinking water; skipped where a backstop already tops it up). The route is simulated on a copy, never assumed: return day within 60 days, whether everyone is still home 30 days later, the day they leave again if not, crew cost, market spend and cash at return, or the exact return checks still failing. Work shows it with one Book button that logs the ordinary `hireConstruction` / `settings` / `standing` actions (replayable; clears undo like a crew booking). On the day-240 winter save it books both heaters ($2,347), upkeep first, drinking-water and firewood orders; forecast home day 2 and still home 30 days later. Booked for real, both residents stay home 90 days above 50 wellbeing with the remote job kept. An early draft that skipped orders when 14 days of stock was on hand ran out of firewood around day 60 and the household left on day 75; that is why every bought input now gets an order.

**Validation:** 277/277 unit tests (8 added), typecheck, lint, catalog:check and all pacing gates pass. Browser sweep 52/54 on a fresh `npm run build`, including the new route scenario; failures are the two baseline cases (tablet drawer-collapse, outhouse map-card), and the outhouse case was re-confirmed failing with these changes stashed. Correction: an earlier 51/53 sweep for items 4–5 ran against a stale `dist/` (Playwright serves `npm run preview`); rebuild before browser runs. No goldens, fixtures, catalog quantities or digests changed. Screenshot: `docs/screenshots/phase-4/recovery-route.png`.

**Gaps:** the route only books existing projects; with none, it names the failing check but does not choose a system to buy. Crew price ($35/h) and order levels are initial tuning. Standing orders persist after return.

## Phase 4 — LL-10 controlled first-year comparisons (2026-10-22)

Continued on `codex/phase-0-1` after the first-batch items 4–6 (uncommitted), local only. Measurement only: no balance constants, catalog quantities, rewards or starting resources changed.

**Shipped:** `packages/cli/bots/compare.ts` (strategy variants on the tutorial route, fixed-day decisions, a schedule replayer for tutorial-off, year-1 metrics, winter-save rescue) and `npm run sim -- compare [--md] [--json] [--days]`. Seven comparisons × 2–3 variants × (3 Standard + 9 real-weather runs), plus the recorded winter save; about 3 s. Results: `docs/PHASE_4_COMPARISONS.md` (generated) and findings in `docs/PHASE_4.md`.

**Headline:** the tutorial route is a viable Standard first year (0/12 departures), but it ends with about $430 and a 0–9 day pantry. Removing gifts, adding a yurt, a cistern or a $2,100 crew all end in a cash-out food collapse. A remote job pays well but starves upkeep (sanitation), and the household leaves by day 53. There is no per-adult job limit.

**Likely defect found (open, unfixed):** a job stopped by another missing input still claims its labor share in `laborPool` (`time/step.ts:459–461`); the hours are lost. Part-time job without transport: −2.86 h/day worked, heater 60 days later. Also open: slightly negative cash (to −$62), starter shelter at 56% of two-adult need.

**Validation:** 5 new CLI tests, including that the comparison baseline plays the identical game to the pacing `tutorialFollower` (actions and digest). 282/282 unit tests (all pacing gates included), typecheck and lint pass. No browser-facing changes in this phase. Digests unchanged.

## Labor fix — stalled systems no longer discard labor (2026-10-22)

Continued on `codex/phase-0-1`, uncommitted. Engine `0.4.0`; save schema unchanged.

**Fix:** `reuseIdleLabor` (`time/step.ts`, step 6d) gives upkeep hours granted to systems that could not run to jobs still short that day, in priority order: resident construction, then gathering (lands for tomorrow). It never reduces any grant and skips crewed projects. It is gated by `settings.reuseIdleLabor`: `NewGame` and the default game set it; `loadGame` appends one settings action at continuation for older saves (merged with `safeRecovery` when both are missing); the load message says so. Legacy logs replay unchanged.

**Tests:** 4 new engine tests (leak gone with the setting, a working job still competes, legacy keeps recorded behavior, labor sums to the pool) and a pacing suite under new-game rules (5 gates × 3 sites × 3 seeds). The comparison harness now runs with the app's new-game settings. 291/291 unit tests pass. Spring `9544bdc2fdf7f9cf` and winter `f90dc93c4f4d1a4a` replay digests and all `digests.json` values unchanged.

**Comparisons rerun:** the part-time-job-without-transport variant now matches no job (heater day 25 in every run, was ~80). All other headline findings are unchanged (`docs/PHASE_4.md`).

## LL-13 — town return is reachable for the starting household (2026-10-22)

Roadmap: `../UPGRADE-ROADMAP-2.md` (LL-13). Continued on `codex/phase-0-1` after `e2cfd9f`. Engine `0.5.0`; save schema unchanged.

**Return rule:** the shelter return check now uses the survival threshold (`SURVIVAL.shelter.short`, 50%), the same one the return trial applies, instead of 100% of nominal need. The Oct 22 playtest showed the greenfield starter tent covers about 56% of two adults, so every greenfield household that went to town was stranded. Gated by `settings.survivalShelterReturn`: `NewGame` and the default game set it, `loadGame` appends it at continuation with the other upgrades, and the load message says so. Legacy and `safeRecovery`-only logs keep the full-shelter rule and their digests.

**Route proposals:** return checks are now structured (`returnCheckItems`: resource + text). When the existing projects and orders cannot bring the household home, `recoveryRoute` tries the cheapest catalog systems (purchase plus crew, buy or DIY, no backstops/conventional) for the first failing need, placed by the home shelter. It simulates each and keeps the first that clears the check, up to 3 needs. Its place action leads the route, and the existing crew logic books it. If nothing affordable works, `unbuildable` says which need, and the Work panel shows it. No shelter at all: DIY Bell Tent $300 + $105 crew, home on day 1; about 32 ms.

**Alert:** the town-recovery alert's button follows the first failing check (it was hard-coded to Heat). Departure causes list survival needs only, and the copy points to the route in Work.

**Validation:** 5 new engine tests (starter tent passes; legacy keeps full shelter; no-shelter route proposes, crews and returns; unaffordable route names the need; alert resource and causes). 296/296 unit tests. Pacing passes under legacy, safer-return and full new-game rules (3 sites × 3 seeds). Browser 52/54 on a fresh build (same two baseline failures). The LL-10 comparison tables are unchanged: in those runs the households still can't return for other reasons (no cash, or employment starving sanitation), and the bots don't book recovery routes. Digests unchanged.

## LL-16 — water storage keeps safe water first (2026-10-22)

Roadmap: `../UPGRADE-ROADMAP-2.md` (LL-16). Engine `0.6.0`; save schema unchanged.

**Fix:** in the shared Water storage pool, untreated Water overflows before Drinking water (`SPILL_FIRST`, `storeAndSpoil`). Any remaining overflow is shared as before. Auto-gather water trips are sized to tonight's free room: room now, plus today's use, minus yesterday's non-fetched inflow (rain, treatment). Work's storage warning gives the storage limit in days and says which overflow rule applies. Gated by `settings.safeWaterFirst`, wired like the earlier flags (new games, default game, continuation, load message, comparison harness, new-game pacing suite).

**Regression:** `gather.test.ts` replays the Oct 22 sequence (greenfield, 7-day target set on day 8, 20 days). Legacy drains safe water below 10 gal with more than 30 gal spilled; with the fix, 0 safe water spills, over 40 gal stays, raw spill falls from about 36 to under 2 gal/day, and fetching hours drop.

**Validation:** 299/299 unit tests; pacing passes under legacy and full new-game rules; browser 52/54 on a fresh build (same two baseline failures); digests unchanged. Comparisons regenerated. Remote-job survival improved and the Bell Tent real-weather variant worsened (see `PHASE_4.md` update; the latter is unexplained).

## LL-15 — food, safe water and cash warn before they run out (2026-10-22)

Roadmap: `../UPGRADE-ROADMAP-2.md` (LL-15). Continued after `17de530`. Read-only views; no simulation change, no settings gate, digests and comparison tables unchanged.

**Runway alerts (`survivalAlerts`):**

- **Food:** prepared Food plus edible harvest in stock, excluding the planting reserve (seed potatoes), against yesterday's need net of home-grown supply.
- **Safe drinking water:** stock against need net of yesterday's filtering and boiling.
- **Cash:** `cashRunway` gives days at the last four weeks' net spending, excluding purchases, and names the largest weekly lines; it warns at 30 days or less.
- **Standing orders:** a resource with a standing order is not warned about while cash lasts more than 7 days. This also applies to the item-4 consumable warnings.

**Forecast:** `transitionForecast` now reports `firstHarm` (first shortage below the survival threshold), `departureDay` and `cashZeroDay`. Given a forecast, `survivalAlerts` adds a headline alert. The hint card refreshes the forecast weekly and on any player action, and offers Open Market for food, water and cash warnings.

**Ranking (interim, before LL-14):**

1. Town recovery and today's survival shortages.
2. Runways that keep people alive (food, water, cash, and inputs to sanitation, heat, cooking fuel or safe water), by deadline.
3. The forecast.
4. Production-only inputs (feed, seed, compost).
5. Comfort (cooling).

The novice replay showed exhausted chicken feed holding the single hint slot for weeks; this ordering stops that.

**Novice replay (quest steps without the unmentioned standing orders, new-game rules, all three sites):** the top alert forecasts the departure from day ~22, about 60 days before hunger; "Food runs out" reaches the top 6–7 days ahead. Carbon runs out the same week and reaches the top only a day ahead, because food is due first and the UI shows one alert. That needs LL-14's list.

**Validation:** 7 engine tests and 1 novice-replay test (`packages/cli/test/alerts.test.ts`). 307/307 unit tests, typecheck, lint, pacing; browser 52/54 on a fresh build (same two baseline failures).

## LL-14 — one ranked list of every alert (2026-10-22)

Roadmap: `../UPGRADE-ROADMAP-2.md` (LL-14). Continued after `06d35e5`. Read-only views; digests and comparison tables unchanged.

**Engine:** each `SurvivalAlert` now has a section (`group`: Act now / Coming up / Supplies for production / Comfort), `days` and a severity `weight`. For today's shortages, `days` is the days to wellbeing penalties (`current: true`); for a runway, it's the days until the shortage. The list is sorted by section, then deadline, then weight; town recovery stays first.

- A survival runway due within 7 days moves into Act now.
- A runway for a supply that's already short today is dropped as redundant.
- The forecast no longer repeats a shortage listed for today.
- Titles pluralize correctly.

**UI:** the single hint slot is replaced by Needs and bottlenecks (`HintCard`, `data-testid="hint"` kept). It shows every alert, grouped and ranked; each row shows its deadline chip and actions (sources, Market, the forecast tab in Plan, Work), and the most urgent row is open. Weekly design advice moves to an Improve section with the same dismiss rule. The list scrolls within 45vh and collapses to its most urgent line while placing (part of LL-12).

**Validation:** 2 engine tests (sections in order, deadlines ascending within a section, current shortages marked, no forecast repeat) and the browser test `alerts.spec.ts` (food and water runways both visible under Act now, deadlines ascending, Market action present, collapses while placing). 309/309 unit tests; browser 53/55 on a fresh build (same two baseline failures). Screenshot: `docs/screenshots/ll-14/needs-and-bottlenecks.png`.

## LL-17 — no day-1 false alarm (2026-10-22)

Roadmap: `../UPGRADE-ROADMAP-2.md` (LL-17). Continued after `977cae2`. Engine `0.7.0`; save schema unchanged.

**Cause:** the start's silent "eve" day began with no Organic waste (people make it during the day), so the starter toilet stalled on the eve and day 1 showed 0% sanitation. Every steady starter-kit gap (hot water, electricity, transportation) was also announced as a new shortage on day 1, and the game auto-paused.

**Fix:** with `settings.serviceWarmUp` (read only when a game starts, through `startGame`/`gameFromStart`), a second silent day starts from the first day's household by-products (Organic waste, Food waste, Greywater). Those by-products carry into day 1, the stockpile stays exactly as the start defines it, and the eve's shortage flags carry over, so only shortages that first appear on day 1 are announced. `NewGame`, the bots (`playBot`/`runGates` gain start settings) and the comparison harness enable it. Legacy inits replay unchanged.

**Validation:** 3 engine tests in `starts.test.ts` (day-1 sanitation equals the steady state on all three sites, with no sanitation shortage event or alert; stockpile identical; legacy keeps the recorded gap). Greenfield day 1–2 events went from 5–6 shortages and a sanitation alert to none on all sites. 312/312 unit tests; pacing passes under legacy and full new-game rules (now applied from the start); browser 53/55 on a fresh build (same two baseline failures). Comparisons regenerated: the tutorial baseline's 2 essential-short days were this artifact (now 0; lowest wellbeing 75). The unexplained Bell Tent variant moved again (real-weather median lowest wellbeing 31); still open.

## LL-48 — a novice bot in the pacing gates (2026-10-23)

Roadmap: `../UPGRADE-ROADMAP-2.md` (LL-48), the last item of the first batch. Continued after `5f42d1b`. Bots and tests only; no engine or app change.

**Bot (`packages/cli/bots/novice.ts`):** reproduces the Oct 22 playtest's novice. It does each quest's own steps except the standing orders the quest text never mentions, and reacts only to Act now in Needs and bottlenecks. For a supply about to run out, it sets a standing order for 7 days of the last week's use; with residents in town, it books the recovery route when the game says it works. The forecast refreshes weekly, as in the hint card. `noviceBot({ react: false })` ignores the alerts, as in the playtest.

**Gate (`greenfield-novice`, real weather, 3 sites × 3 seeds, new-game settings):** nobody leaves before day 300, and every departure was preceded by a forecast or Act now alert at least 14 days earlier. Gates may now carry start settings, and `check` receives the bot instance (for what it saw). `NEW_GAME_SETTINGS` moved to `bots/run.ts` and is shared by the gates and the comparisons.

**Results:** Front Range and Asheville stay home all year in every seed; orders are set around day 75 (Food) and day 79 (Carbon), before both cliffs. Laramie leaves on days 339–347 when cash runs out with no income (LL-24); each departure was warned. The alert-ignoring novice fails the gate (left on day ~87), which is the playtest outcome.

**Validation:** gate passes in `pacing.test.ts` and both policy suites; the teeth test in `alerts.test.ts`. 316/316 unit tests, typecheck, lint.

## LL-18 — a tutorial that keeps teaching through the season (2026-10-24)

Roadmap: `../UPGRADE-ROADMAP-2.md` (LL-18), first Phase 7 item. Continued after `4ad8b90`. Engine `0.8.0`; save schema unchanged.

**Seasonal line (`data/quests/greenfield-seasons.json`), chosen at start by `settings.tutorialSeasons`:** saved games keep the line they started with, and their replays are unchanged.

| # | Quest | Change |
|---|---|---|
| 1–3 | Water, firewood, bed | Unchanged |
| 4 | Compost | Text names the Carbon standing order its steps set |
| 5 | Water target | Text names the grocery order |
| 6 | Hens | Text names the feed order; Show me opens the coop |
| 7 | Keep supplies coming (new) | Goal: standing orders for Food, Carbon and Chicken feed |
| 8 | Build the heater before the cold (new, summer) | Goal: heater built and a 4-week wood rule; takes the old cold quest's reward |
| 9 | Grow 25% of your food | Moved before winter; Show me opens the quail hutch |
| 10 | Put up a winter woodpile (new) | Goal: 1,200 lbs of firewood in stock, gathered or bought; the step buys 600 lbs, about $60, because one Laramie deadfall can't supply it |
| 11 | First cold snap | Now `staysWarm`: three cold days with residents home and household heat at the survival level, so an unheated second shelter no longer blocks it; the text says it waits for the cold |

Neighbor assistance totals are identical ($2,600 cash plus the same stock).

**Engine:** goal kinds `standing` (a standing order exists) and `staysWarm` (survival heat on cold days with someone home). **Novice bot:** sets a scripted standing order when the quest text names its resource.

**UI:** the stabilization paragraph shows on quest 1 only; the cold-day line shows on quest 1 and heating quests. Show me's drawer filter clears once the card closes or placement starts.

**Effect:** the tutorial and novice bots finish all 11 quests on every site and seed. The last summer quest is done by days 53–75, and the cold-snap quest completes on the first cold days (151–289). Nobody leaves home. On this line, a novice who ignores alerts survives on the quest text alone; on the original line it still fails the novice gate.

LL-10 comparisons (regenerated; the harness drops gf-heater's steps in the winter variants and prices gifts from the line actually played):

- **Tutorial baseline:** year-end cash median $980 (was $365). Gifts received in year 1 are $3,248, because the food quest's $500 no longer waits behind winter.
- **Bell Tent on day 30:** median lowest wellbeing 75 (was 31), short days 3 (was 19). This resolves the open Bell Tent question: the variant suffered from the unmentioned supply orders.
- **Yurt:** days away 144 (was 182).

**Validation:** 6 engine tests (line selection, named orders, Show me targets, unchanged totals, `staysWarm` vs `warm`, `standing`); 2 CLI tests (whole line in year 1 on all sites; quest text alone suffices on the seasonal line); the teeth test now pins the original line. 324/324 unit tests, typecheck, lint, catalog:check; browser 53/55 on a fresh build (same two baseline failures).

## LL-19 — pre-purchase previews a novice can trust (2026-10-24)

Roadmap: `../UPGRADE-ROADMAP-2.md` (LL-19). Continued after `cd856f0`. Read-only views and UI; no simulation change.

**Card input bars (`systemCard`, catalog preview):** stored supplies show stock on hand and how long it lasts with this system added (unmet design demand included); a full bar means 14 days or more. In the playtest, the potato patch read "Compost 200 / 200" with 3.6 lbs in stock; it now reads 3.6 lbs, about 6 days, half a bar. Other inputs keep last week's design availability, and the basis line says which is which.

**Project preview (`projectPreview`):**

- **Supplies:** a list per recurring input, with this system's weekly use, the share on-site systems cover after the build (annual balance), stock and days on hand, and the cost per week if bought.
- **Running cost:** now adds the required supplies the design doesn't make. The coop showed "$0/week"; it now shows about $6.30 of feed.
- **Heaters:** say how much of the household's cold-day heat gap they close. Producers of heat or cooling are now sampled next to the home shelter rather than at the parcel's first legal spot. With only the starter stove, a greenfield tent has no nominal cold-day gap; the unheated second tent from the playtest does.
- **Free materials:** show their market value (bed soil: $36, brought in free).

**Card:** Buy or DIY is remembered across cards for the session (it starts on Buy, so existing keyboard and card tests are unchanged).

**Validation:** 5 engine tests on the playtest cases (compost stock, coop feed cost, potato water coverage, heater gap closure, soil value) and a browser test `preview.spec.ts` (coop supplies line and list; DIY remembered). 329/329 unit tests, typecheck, lint; browser 54/56 on a fresh build. The tablet drawer and outhouse map-card failures are the old baseline ones; the tablet one was re-checked with these changes stashed. Screenshot: `docs/screenshots/ll-19/coop-supplies.png`.

## LL-20 — resource pages agree with the ledger (2026-10-24)

Roadmap: `../UPGRADE-ROADMAP-2.md` (LL-20). Continued after `c945d35`. Views and UI only.

- **Cash, not "Capital":** a store's Capital input is checked against the household's cash and shown as "weekly cash". The playtest showed "Capital (you have none)" with $8,000 in cash.
- **Food substitutes:** `resourcePage` lists the producers of substitutes (eggs, potatoes, greens) in Food's own units. The Food page said "Nothing you have makes Food" while those fed the household; it now says nothing makes *prepared* Food and lists what feeds the household instead.
- **Stock line:** shown only for storable resources, so Heat no longer shows "In stock 15.1k BTU" above "It cannot be kept".
- **Disposal copy:** "piles up in stock until something uses it" only appears when nothing does; otherwise "Kept in stock until your systems use it; there is no storage limit."
- **Standing orders on the page:** the page shows the current standing order and sets or clears it next to Buy, where the low-reserve alert sends the player.
- **Alerts and orders:** low-reserve alerts already go quiet once a payable standing order exists (LL-15).

**Validation:** 5 engine tests in `resource.test.ts` and a browser test in `preview.spec.ts` (set a feed order from its page; store shows weekly cash). 334/334 unit tests, typecheck, lint; browser 55/57 on a fresh build (same two baseline failures).

## LL-21 — reports and alert copy (2026-10-24)

Roadmap: `../UPGRADE-ROADMAP-2.md` (LL-21). Continued after `c68c292`. Views and UI only; ledgers and digests unchanged.

- **Reports don't steal focus:** a season or year report made while Needs and bottlenecks has an Act now item no longer opens over it. It waits behind the Reports button with a "new" badge (`unreadReports`, cleared when Reports opens). Read-only shared views have no alert list, so their reports open as before.
- **Survival first:** "What ran short" lists shortages of food, safe water, shelter, heat and sanitation before comfort rows, still capped at three.
- **Assistance labeled:** the money line separates the neighbor's quest cash (`cash.assistance`, from the tutorial's completion days within the report window) from refunds; net is unchanged. In the playtest, the season report showed "refunds $1,500" for Ruth's rewards.
- **Departure causes:** survival needs only (done in LL-13).

**Validation:** 2 engine tests (assistance vs refunds; survival before comfort) and a browser test (a spring report during an empty-pantry crisis waits behind Reports; opening Reports clears the badge). The read-only year-report test caught a regression during development, now fixed. 336/336 unit tests, typecheck, lint; browser 56/58 on a fresh build (same two baseline failures).

## LL-22 — interface polish (2026-10-24)

Roadmap: `../UPGRADE-ROADMAP-2.md` (LL-22). Continued after `844e928`. Views, UI and tests only.

- **Numbers:** `fmtNum` no longer uses scientific notation ("1.9e-3 oz/week" is now "0.002"; anything smaller reads "< 0.001", and exact values stay in Why). The existing format test was updated to the new intended output and still guards against tiny real values showing as 0. `fmtDays` caps runways ("21.5k days" is now "over a year") in Market. Plan's summary layout score shows one decimal; the Sensitivity table keeps its deliberate four.
- **Overlays:** the status bar and the toast stack let map clicks through; their buttons and toasts stay clickable. In the playtest, placement clicks under the status bar were silently swallowed. Invalid placements already explained themselves in a toast.
- **Delivery fees:** `weeklyBills.deliveryShare` gives delivery charges as a share of market spending over 28 days. Market warns at 25% or more and suggests bigger, less frequent orders or transport.
- **Old browser failures fixed:**
  - *Outhouse map card (sources.spec):* the double-click on the outhouse at the map's bottom-left was swallowed by the toast stack. Fixed by the overlay change; the test is unchanged.
  - *Tablet drawer (ship.spec):* app behavior was correct; the test clicked a fixed 25% of the map, which on the tablet's zoom-to-fit lands at the parcel edge where a yurt rightly doesn't fit, and it measured the sheet mid-animation. The click now targets a point inside the parcel and the height check waits for the 0.15 s transition. Same assertions.
- **Not done:** redraw-after-resize and the measurement period in every table (from LL-12) remain open.

**Validation:** 2 engine tests (delivery share), updated format tests. 339/339 unit tests, typecheck, lint. **Browser 58/58 on a fresh build**, the first fully green run since the imported baseline.

## LL-11 — the full player story survives a save; Phase 7 complete (2026-10-24)

Roadmap: `../UPGRADE-ROADMAP-2.md` (LL-11, carried from the first roadmap). Continued after `cd5487b`.

**Report history:** reports aren't stored in saves, so loading showed none (the Oct 16 playtest's June checkpoint lost "Reports (1)"). `reportsClosingAt` is now shared by the clock and `rebuildReports`, which rebuilds the last 12 reports from the game's own 730 days of ledgers whenever a game loads. Root-cause chains use the loaded state.

**Round-trip tests (`replay.test.ts`):**

- A greenfield game, driven only by logged actions under every new-game flag, with a DIY yurt mid-construction, a firewood cap, a Carbon standing order and an undelivered firewood purchase, replays to the same digest, keeps the seasonal line and flags, and over the next 20 days matches a never-saved copy: same digest, same market trips, the order delivered once, construction progress equal.
- The winter game with residents in town round-trips and plays 30 days identically.

**Browser (`saves.spec.ts`):** exporting a game with two reports and importing it into a fresh browser restores the same report titles and count; the June playtest checkpoint loads with its spring report.

**Migration strategy:** `docs/SAVES.md` records what a save preserves and the rule used since Phase 2: a flag gates the new behavior, start-only flags are read at start, new games opt in, continued games get one settings action, `ENGINE_VERSION` is bumped, and tests prove legacy digests are unchanged.

**Validation:** 342/342 unit tests, typecheck, lint; browser 60/60 on a fresh build.

**Phase 7 complete:** LL-18 (`cd856f0`), LL-19 (`c945d35`), LL-20 (`c68c292`), LL-21 (`844e928`), LL-22 (`cd5487b`), LL-11 (this commit). Open from LL-22: redraw after resize and the measurement period in every table. Next: Phase 8 (LL-23 to LL-27).

## LL-22 follow-ups and Phase 8 — first-year balance (October 24, 2026)

Engine **0.9.0**, save schema unchanged. Branch `codex/ll22-phase8`. Decisions and measured before/after results: [PHASE_8.md](PHASE_8.md); full LL-10 tables regenerated in [PHASE_4_COMPARISONS.md](PHASE_4_COMPARISONS.md).

- **LL-22:** immediate redraw and placement refresh after resize, including with the ticker stopped; measurement windows/normalization in every UI table. Browser coverage checks resize transforms and placement coordinates, and captions on measured/forecast tables.
- **LL-23:** gated `employmentPriority`, a Work row below upkeep by default, at most 40 worked hours per resident adult/week, placement warnings, separate ledger hours, and reuse of idle granted employment labor. Remote work now survives Standard at all three sites and real weather in all nine cells.
- **LL-24:** chose the explicit starter-shortfall option and viable no-gift cash runway. New greenfield starts get $8,000 per adult under start-only `householdStart`; old starts retain $8,000 total. Standard no-gift actions survive with minimum wellbeing about 75 and $4,538–$5,540 remaining. The yurt replacement (retire the tent after completion) also survives all sites, with $2,306–$3,174 remaining. Original extra-shelter variants remain in the suite; Laramie fails from heating both buildings (LL-32), not lack of cash.
- **LL-25:** gated `siteCrewRates`: $18/h Front Range, $16/h Laramie, $15/h Asheville, explicitly game balance choices. Price follows remaining hours; booked rates persist for refunds; Work shows time saved and the average-climate heating deadline. Recorded zero-labor winter recovery drops from $2,347 to $1,207 and still returns the household on day 1 for at least 90 days. Ordinary late-heater crews remain unnecessary in some sites, and cannot cure an earlier fuel shortage.
- **LL-26:** gated `cashFloor`: reject unaffordable placements, hold blocked deliveries, stop unfunded connection fees/service, and allocate operating cash after backstop spending. Accounted daily balances remain nonnegative. Tests deliberately exercise low cash; the higher starting cash alone does not prove this rule.
- **LL-27:** closed by verification. Source workbook S066/F0324–F0325 is already heating-shaped; S067/F0327–F0329 includes year-round Cooking fuel. `git blame` traces that distinction to `60fad89`. Tests pin summer/winter behavior and annual fuel totals at every site. No workbook, generated catalog, parity golden, or wage change.

New games enable the runtime flags; loading a legacy game records all missing runtime flags in one continuation action after verification. `householdStart` is never added on continuation. Save round-trip coverage includes all new flags, and the legacy digest fixtures still pass. Crew-price and starting-cash assertions in browser tests were updated to the new exact policy amounts; their behavioral assertions remain.

**Validation:** 360/360 unit tests; typecheck, lint, production build, catalog consistency and all pacing gates pass. Full browser suite: 63/63 pass. A final continuation regression additionally proves that mixed legacy/new employment ledgers reconcile without double-counting Work hours; all 10 affected browser tests pass on that final build. New screenshots: `docs/screenshots/phase-8/employment-priority.png` and `resize-redraw.png`; both visually checked.

## Phase 9 — LL-28 wear/repair and LL-29 selling/trade (October 24, 2026)

Engine **0.10.0**, save schema unchanged. The existing Phase 8 working changes were retained. Both Phase 9 flags remain explicitly opt-in under Settings → Experimental mechanics; no new-game default or continuation migration enables them. Details: [PHASE_9.md](PHASE_9.md); measurements: [PHASE_9_COMPARISONS.md](PHASE_9_COMPARISONS.md).

- **LL-28:** condition follows catalog lifespan, realized use and missed upkeep; output/capacity declines below 30% and stops at zero. Repair/replacement charge parts, stop operation and queue real labor. Completion restores condition. Cards show quotes and state; bills show an annual replacement allowance. Equipment wear excludes people, livestock, living crops and land. Service retains the built removal-refund rate; it cannot convert an old asset into a fully refundable purchase.
- **LL-29:** sell or barter explicit surplus quantities with a protected reserve after household consumption. Actual labor, transport/collection charges, proceeds, stock sold and barter deliveries are accounted. Unfilled orders wait. Farm Stand S178 raises the sale share from 50% to 80% when operating; Ruth barters at 70% after tutorial completion. Sale-only reference prices cover produce, eggs, honey and wool. Rates are experimental game balance assumptions, not sourced business forecasts.
- **Catalog:** added the stand through `catalog_patch.py` in the source workbook and regenerated catalog/parity goldens. Verified against `git show HEAD`: zero existing typed cells changed; only range-extension formulas and the added rows differ. Catalog tests now use the next free system/flow IDs and assert the new exact row counts.
- **Accounting and saves:** sold goods are distinct from food eaten. New actions, pending trades, condition and service queues replay and round-trip through JSON. A focused regression caught and fixed an undefined optional contractor property changing a post-save digest. Legacy fixture digests pass with the flags absent.
- **Comparisons:** 48 paired first-year runs across three sites and Standard/Real weather plus 12 focused harvest/worn-panel checks. Conservative first-year reserves leave nothing to sell, and an idle stand costs money. The controlled 300 lb harvest yields $1,200 at market vs $1,920 at the stand before stand costs; repair nearly doubles an already-worn panel's 30-day output. No defaults changed.

**Validation:** **372/372** unit tests (12 new engine regressions); typecheck, lint, production build, catalog consistency and all pacing gates pass. Full browser suite **64/64** passes, including the new Settings → Market → repair flow. The final service-wording change was rechecked with the focused browser test. Screenshot: `docs/screenshots/phase-9/repair.png`, visually inspected. Existing tests were retained; exact catalog counts and modding fixture IDs were updated for the added workbook row.

**Limits:** deterministic equipment wear, not LL-38 random breakdowns; no CSA subscription, finite barter inventory or relationship progression. Purchases and sale collection use separate trips. Mechanics remain experimental pending longer-term economic calibration.

## Phase 9 — LL-30 preservation and LL-31 livestock lifecycle (October 24, 2026)

Engine **0.11.0**, save schema unchanged. Both new flags remain opt-in in Settings → Experimental mechanics; neither new games nor continuation migration enables them. Scope and controls: [PHASE_9B.md](PHASE_9B.md). Reproducible measurements: [PHASE_9B_COMPARISONS.md](PHASE_9B_COMPARISONS.md).

- **LL-30:** appended Preserved food (kcal) to the source workbook via a resource-row extension to `catalog_patch.py`. Zero existing typed cells or cached numeric results changed. Canning/drying standing rules turn eligible fresh food into lower-loss reserves, drawing real spare labor and energy after household use, with protected fresh/planting reserves. Root cellars and powered freezers protect fresh stock; actual operation determines Food storage under the gate. Processing has separate resource/energy/labor receipts; it is not food eaten or additional harvest. Resource pages identify processors, actual batches, fresh-food users and build options.
- **LL-31:** fed chick batches mature into twelve-hen cohorts; age and daylight affect production. Explicit paid breeding needs fed days, human work and valid parcel space. Culling consumes work, removes animals and produces meat once; steady catalog Meat output is suppressed only under the gate. Old age and seeded predators produce events. Working secure housing or an in-range, fed guardian prevents predator loss. Cards, map sprites, tutorial counts, toasts and the Almanac follow the lifecycle. The hardship auto-pause preference includes predator warnings.
- **Compatibility:** recipe/lifecycle/risk quantities are validated catalog overrides and marked experimental game balance. The independent saved predator RNG cannot change climate draws. Policies, partial work, pending births, warnings, age and cohort sizes round-trip. Legacy zero-resource numeric projections and committed digest fixtures remain unchanged. A final pause/resume regression caught and fixed a cohort-scale loss when lifecycle was turned off; pausing aging now retains all twelve hens' scaled output.
- **Comparisons:** 48 paired first-year runs, six winter-stock runs, six feed/growth runs, six guardian-range runs and three breeding/culling timing checks. The matched first-year route survives all 12 site/weather cells, but has no excess above its fresh reserve, so processing does not run there. An isolated 450,000-kcal harvest ends day 120 with 62,480 kcal under drying versus zero held fresh; drying avoids three food-short days and uses 73.7 hours. Fed chicks mature, unfed chicks do not; a nearby guardian prevents the same seeded attack that takes the unprotected hen. Validation-supply fixtures are labeled separately from ordinary-stock runs.

**Limits:** cohort/enclosure abstraction, external breeding/fertile-stock service, and game balance yields rather than detailed husbandry/food-safety modeling. No frozen-food thaw inventory, individual sex/genetics, disease, or Phase 10 incubator/run catalog expansion. Flags remain off pending balance decisions.

**Validation:** **392/392** unit tests (16 new engine regressions and four catalog validation tests); typecheck, lint, production build, catalog consistency, Python compilation and all pacing gates pass. Full browser suite **67/67** passes, including three new processing/animal/maturation flows. The final cohort pause/resume correction was rechecked with the full unit suite and all three affected browser tests. The unchanged 150 ms simulation performance gate passes at **53.1 ms** for a year with 196 instances (one simultaneous browser/unit run had exceeded it under load; tests and thresholds were retained). No committed digest fixtures or existing behavioral assertions were weakened. Screenshots: `docs/screenshots/phase-9b/preserved-harvest.png`, `predator-warning.png`, and `mature-hens.png`, visually inspected. Screenshot files captured before this work were restored byte-for-byte after browser verification, retaining the new Phase 9b artifacts.

## October 24, 2026 — Phase 9, LL-32 shelter occupancy (one ticket)

**Shipped:** engine **0.12.0**, with explicit opt-in `shelterOccupancy` under Settings → Experimental mechanics. Person cards assign completed, open homes; shelter cards list residents, living space, yesterday’s actual heat receipts and close/reopen controls. Automatic assignments keep the initial household together, so a spare shelter does not move anyone. Explicit overcrowding shares only that home’s capacity; condition loss is reflected in assigned space and card quantities. People in town reserve their assignment without operating demand. A deleted explicit home requires reassignment.

Empty shelters request no heat/cooling. Closing an unassigned shelter supplies no living space and retains 10% recurring labor/capital upkeep, with physical roof/storage retained. Actual thermal output is split once among reachable occupied homes, with catalog delivery distances and the existing one-day supply delay. Per-home receipt maps survive saves/replay; the least-served resident determines warmth credit and local shelter/heat return checks. Occupancy enforces the safe return trial even without the older recovery flag. Cold-day forecasts cap useful heat locally. Legacy mode ignores the new policies; startup/continuation migrations never enable this flag. No catalog numbers, dependencies or LL-33 mechanics changed.

**Measurement:** `docs/LL_32_COMPARISONS.md` contains 36 ordinary-supply first-year runs, three sites × Standard seed 1 / Real seeds 1–3 × legacy/occupancy/closed. All variants buy the same day-120 spare tent and share the remote-job tutorial policy. Laramie Standard falls from 29 survival-short days to one initial routed-supply warm-up shortage, minimum wellbeing rises from 0 to 74.4, and qualifying cold days rise from 28 to 272. Closing the spare saves about 7.88 upkeep hours. Policy reactions can change later action dates; heat reduction includes all unoccupied tutorial-built shelters. Defaults remain unchanged. Rules, assumptions and limitations: `docs/LL_32.md`; save contract: `docs/SAVES.md`.

**Validation:** **406/406** unit tests, including fourteen new occupancy regressions; **68/68** full browser tests, including the new assignment/closure flow. Typecheck, lint, production build and catalog consistency pass. Existing pacing gates, parity and legacy digest fixtures pass without changes to their assertions. Conservation checks demonstrate that globally sufficient heat cannot mask a distant cold home and shared output is not duplicated; cooling stops after power loss, closed labor/capital bills fall, and condition loss lowers living space. Final condition/card alignment was rechecked with the full unit suite and the affected browser flow. The unchanged 150 ms one-year performance gate passed (128.4 ms under concurrent build load). Two screenshots in `docs/screenshots/ll-32/` were visually inspected; screenshot files present before this ticket were restored byte-for-byte after verification. Roadmap records LL-32 complete and leaves LL-33 next.

## October 24, 2026 — Phase 9, LL-33 separate storage pools and winter water (one ticket)

**Shipped:** engine **0.13.0**, with explicit opt-in `storagePools` under Settings → Experimental mechanics. Water storage holds raw water only; drinking water has its own 50 gal containers (the catalog buffer), so neither pool can spill the other. Hay and chicken feed share a Feed storage pool in free Storage space plus 10 cu ft of bins; market trips bring home only what fits. Above-ground tanks (rain barrel, IBC, both cisterns) accumulate frost from °F-days below 32 °F, freeze at a per-tank tolerance, lock their share of raw water and leave the raw pool until they thaw. Tank cards offer insulation (4× tolerance) or a thermostatic heater that draws spare electricity; both cost cash and real labor. All quantities are experimental game balance in `catalog_overrides.json` (`winterStorage`), validated by the exporter; the workbook is unchanged. New `winterize` action, `winter-water` events (Almanac/toasts), and ledger `winter` records and a Water `frozen` term. Turning the gate off returns locked ice to stock. Details: `docs/LL_33.md`; save contract: `docs/SAVES.md`.

**Measurement:** `docs/LL_33_COMPARISONS.md` (reproduce with `node --import tsx packages/cli/bots/storage.ts`): 24 first-year remote-job runs (3 sites × Standard seed 1 / Real seeds 1–3 × legacy/pools), 18 winter tank checks and 3 feed checks. No run gains a survival-short day; raw water spill falls from 193–986 gal/yr to ≤1.3 gal; the starter filter's surplus now spills as 208.6 gal of drinking water; the barrel is frozen 148–153 days in Laramie, 36–66 on the Front Range, never in Asheville. End cash is $14–$168 lower (Laramie Standard: 31 more fetching hours). In Laramie only a powered heater keeps tanks liquid; on the Front Range insulation suffices. Defaults unchanged.

**Validation:** **422/422** unit tests, including 13 new engine regressions and 3 catalog validation tests; **69/69** full browser tests, including the new freeze/insulate/drinking-water-page flow (rechecked with the occupancy flow on the final build). Typecheck, lint, production build, catalog consistency, pacing gates, parity and legacy digest fixtures pass without changes to their assertions. One screenshot, `docs/screenshots/ll-33/frozen-barrel.png`, visually inspected. A UI defect found by the browser test (the price's Why button nested inside the Insulate button swallowed the click) was fixed before the full run.

**Known gap:** the full browser run rewrote every screenshot, and no pre-run copy was taken, so screenshot files that were already modified but uncommitted before this ticket now hold renders of the current build rather than their earlier bytes. Untracked Phase 8/9 screenshot folders were re-rendered the same way.

**Limits:** monthly degree-day temperatures (no within-month cold snaps), no burst tanks or frozen pipes, no snow effect on rain capture, no drinking water container expansion until LL-40, no feed spoilage or rodents, and a removed frozen tank discards its ice.

## October 24, 2026 — Phase 9, LL-34 tools multiply gathering (one ticket)

**Shipped:** engine **0.14.0**, with explicit opt-in `toolGathering` under Settings → Experimental mechanics. The Chainsaw (1.7× firewood, 0.091 gal gasoline per working hour), Scythe (2.4× green biomass) and Broadfork (2× soil, capped from the catalog's implied 13×) no longer produce on their own. They multiply their gathering job's yield per hour at the land's own nodes, depleting the same finite stock. Walking is not sped up. Each tool covers 8 h a day; fuel limits the boosted share; LL-28 condition scales the extra yield. Tool labor falls to catalog upkeep and the card shows the gated inputs and outputs. When no auto-gather target covers a tool's resource, an owned tool keeps about a week of actual household use. Rules are experimental game balance in `catalog_overrides.json` (`toolRules`), validated against the workbook rows; the workbook is unchanged. Gather records gain optional tool hours, extra yield and fuel. Details: `docs/LL_34.md`; save contract: `docs/SAVES.md`.

**Measurement:** `docs/LL_34_COMPARISONS.md` (reproduce with `node --import tsx packages/cli/bots/tools.ts`): 24 first-year remote-job runs with a matched day-1 chainsaw and gasoline order, plus 6 winter firewood checks. No run gains a survival-short day. The legacy chainsaw's 7,020 lb/yr of wood from nothing disappears; the same deadfall ends the year nearly empty in both variants. Firewood hours fall 39–41%, and freed hours go to the paid job (Front Range +$880–$1,126 end cash). Per 100 lb of wood, a chainsaw needs about 1.5 h instead of 2.6. Laramie's single deadfall runs dry with or without the saw (stoves short of wood 90 of 120 winter days), so tools do not fix Laramie firewood. Defaults unchanged.

**Validation:** **435/435** unit tests, including 10 new engine regressions and 3 catalog validation tests; **70/70** full browser tests, including the new chainsaw flow. Typecheck, lint, production build, catalog consistency, pacing gates, parity and legacy digest fixtures pass without changes to their assertions. The browser test exposed that the card showed catalog labor (2.2 h) instead of the gated 0.2 h, and the card now applies tool input/output factors. One screenshot, `docs/screenshots/ll-34/chainsaw-card.png`, visually inspected. All other screenshots were backed up before the browser run and restored byte-for-byte afterwards.

**Limits:** no skill effect (LL-36), no wear from hours of use beyond LL-28, the Wood Chipper is unchanged, and construction materials are still imported rather than gathered with tools.

## October 24, 2026 — Phase 9, LL-35 soil fertility (one ticket)

**Shipped:** engine **0.15.0**, with explicit opt-in `soilFertility` under Settings → Experimental mechanics. Each garden (raised beds, hoop house, potato patch, grain plot, food forest, apple tree, raspberries) keeps a fertility level; harvest = 30% + 70% × fertility of catalog yield, capped at 110%. Cropping draws 0.35 a year (annuals) or 0.15 (perennials) in proportion to the realized harvest on growing days; compost at the catalog's own rate replaces exactly that draw, so a composted bed keeps catalog parity. Compost no longer switches a garden off. Manure fills a compost shortfall at half strength; a working clover cover crop within 100 ft adds 0.2 a year shared by garden area. Bought-soil beds start at 1, dug-in plots at 0.7, perennials at 0.8. Each garden runs as its own group. Rules are experimental game balance in `catalog_overrides.json` (`soilFertility`), validated by the exporter; the workbook is unchanged. New garden card section. Details: `docs/LL_35.md`; save contract: `docs/SAVES.md`.

**Measurement:** `docs/LL_35_COMPARISONS.md` (reproduce with `node --import tsx packages/cli/bots/fertility.ts`): 24 first-year remote-job runs and six three-year garden checks. No run gains a survival-short day. Crops grown fall 17–18% in year one, mostly from dug-in plots starting at 0.7, and gardens end the year at 0.87–0.88 fertility. Over three years, an unfed garden crops 129 → 101 → 79 lb (legacy: nothing); compost or manure at the catalog rate holds the raised bed at 1 and lifts the patch toward 0.86; clover alone slows the decline. Defaults unchanged.

**Validation:** **445/445** unit tests, including 8 new engine regressions and 2 catalog validation tests; **71/71** full browser tests, including the new raised-bed flow. Typecheck, lint, production build, catalog consistency, pacing gates, parity and legacy digest fixtures pass without changes to their assertions. Two fixture mistakes were caught and fixed while building the checks (water storage overflowing in the unit fixture; seed potatoes eaten over winter in the three-year comparison). One screenshot, `docs/screenshots/ll-35/raised-bed-fertility.png`, visually inspected; all other screenshots were backed up before the browser run and restored afterwards.

**Limits:** one fertility number (no separate N/P/K, pH or rotation), compost cannot be over-applied above the catalog rate, and the cover crop is credited by distance rather than sown into the bed.

## October 24, 2026 — Phase 9, LL-36 household composition and skills (one ticket)

**Shipped:** engine **0.16.0**, with explicit opt-in `householdRoles` under Settings → Experimental mechanics. People are adults (catalog Human Being), children (70% needs, 25% labor, no paid work) or elders (90% needs, 50% labor), set on the person card. Building, growing and gathering skills grow with each person's labor share of the day's hours and give up to +50% DIY progress, +25% harvest and +30% gathering per hour (half-learned at 150/100/100 h), averaged across whoever is working. Below 40 wellbeing a person may fall ill (up to 2%/day; no work for 7 days); resident building (0.05%/h) and chainsaw work (0.2%/h) may injure a worker (30% labor for 14 days). Draws use a separate saved `householdRng`. Rules are experimental game balance in `catalog_overrides.json` (`householdRoles`), validated by the exporter; the workbook is unchanged. New person card section, `role` action, `person` events. Details: `docs/LL_36.md`; save contract: `docs/SAVES.md`.

**Measurement:** `docs/LL_36_COMPARISONS.md` (reproduce with `node --import tsx packages/cli/bots/household.ts`): 24 first-year remote-job runs for the default two adults and a validation-supply composition table. No survival change; no illness (wellbeing stays above 40) or injury on the route. Gathering practice reaches 28–29%, which frees paid hours: end cash +$1,107–$2,030 at Front Range and Laramie, +$83–$123 in Asheville. Composition: a child household requests 90% of three adults' food and has 75% of the labor; an elder household 97% and 83%. Adding a third person to the two-adult route collapses it even under legacy rules (shelter and sanitation kit sized for two), so that variant was dropped rather than misread. Defaults unchanged.

**Validation:** **456/456** unit tests, including 9 new engine regressions and 2 catalog validation tests; **72/72** full browser tests, including the new person-card flow. Typecheck, lint, production build, catalog consistency, pacing gates, parity and legacy digest fixtures pass without changes to their assertions. Fixed during the ticket: the wellbeing step's shared-update shortcut would have copied one person's role, skills or illness to a housemate; the person card now shows role-scaled inputs; the illness chance shows two decimals. One screenshot, `docs/screenshots/ll-36/person-card.png`, visually inspected; all other screenshots were backed up before the browser run and restored afterwards.

**Limits:** no aging, births or individual task assignment; no medical care to shorten recovery; starts still create adults only.

## October 25, 2026 — Phase 9, LL-37 finance (one ticket)

**Shipped:** engine **0.17.0**, explicit opt-in `finance` under Settings → Experimental mechanics → Credit, tax and insurance. Market adds a Finance panel: a $5,000 credit line at 12% annual interest, explicit draws and repayments, daily property tax (1% of $10,000/acre/year), optional $180/year equipment failure insurance (80% above a $250 per-asset deductible), and a configurable 90-day emergency reserve against cash runway. Rates are experimental game balance in validated catalog overrides, not market quotes. Unpaid interest capitalizes into labeled debt; tax stays payable; insufficient cash suspends daily insurance coverage. LL-28 newly failed assets pay once. Finance enforces cash affordability even without `cashFloor`; opting in converts legacy negative cash to opening debt. Weekly bills, reports and recent payout/capitalization statements explain the flows. Principal transfers and insurance payouts do not inflate operating runway or earn the net-positive-season milestone. New action/state/ledger fields preserve replay and pending financing through JSON continuation and opt-out. No new dependencies or workbook rows. Details: `docs/LL_37.md`; save contract: `docs/SAVES.md`.

**Measurement:** `docs/LL_37_COMPARISONS.md` (reproduce with `node --import tsx packages/cli/bots/finance.ts`): 36 matched first-year remote-job runs, three sites, Standard seed 1 and Real seeds 1–3, wear enabled for every variant. No survival-short days or wellbeing change. The one-acre route pays $100/year tax; holding a $2,000 draw for a year adds $240 interest, optional insurance $180. Cash less debt ends $100 below legacy for finance alone and $520 below for the insured draw. No first-year equipment failures on the route; controlled Bell Tent failure pays $440 with a paid premium, zero uninsured or unfunded, and zero repeat payout next day. Defaults unchanged; LL-38 next in Upgrade Roadmap 2.

**Validation:** **468/468** unit tests (11 new engine regressions and 1 catalog validation test); **73/73** complete browser tests, including the new borrow/repay/insurance/reserve/bills flow. Final Finance panel and year-report browser checks also pass after the last display changes. Typecheck, lint, production build, catalog consistency, all pacing gates, parity and legacy digest fixtures pass with their assertions unchanged. Visually inspected `docs/screenshots/ll-37/finance.png`; other screenshots backed up before the full browser run and restored afterward. The sandbox blocked the tsx CLI IPC socket and local preview port: catalog/pacing commands used `node --import tsx`, and browser tests ran with approved local server/browser access.

**Limits:** no amortizing mortgage, scheduled principal repayments, tax penalties/seizure or weather/fire coverage. Insurance covers newly failed LL-28 physical assets only. Reserve is trailing net cash burn, not a seasonal forecast; a cash-positive route has a zero target. Switching the experiment off pauses its bills but retains liabilities and policy choices.
## October 25, 2026 — Phase 9, LL-38 warned risk events (one ticket)

**Shipped:** engine **0.18.0**, explicit opt-in `riskEvents` under Settings → Experimental mechanics → Warned risk events. Saved precursor warnings cover LL-28 equipment breakdown, garden pests and disease, wildfire smoke (cooling load plus named air-exposure wellbeing), blizzards that suspend market/delivery backstops, grid electricity outages and drought-related well drawdown. Existing LL-31 predator warnings join the risk list without a second lottery or attack. Completed, operating nearby pest/soil defenses, enclosed living-space-limited refuge, timely repair, reserves, backup power and non-well water mitigate the respective risks. Warnings are visible in Needs and bottlenecks with deadlines and named actions, toasts, Weather Almanac entries, and hardship auto-pause. Actual source/card output multipliers and backstop delivery caps enforce the effects. Separate saved `riskRng`, pending/active threats, measured defense readiness, daily active-risk records, and lifecycle events preserve replay/JSON continuation. Turning the gate off clears transient threats while retaining condition/losses and freezing the stream. Newly failed assets remain visible to LL-37 insurance, so a covered failure pays exactly once. All new quantities/source lists are validated engine overrides; no new workbook rows or dependencies. Details: `docs/LL_38.md`; save contract: `docs/SAVES.md`.

**Measurement:** `docs/LL_38_COMPARISONS.md` (reproduce with `node --import tsx packages/cli/bots/risks.ts`): 48 matched first-year runs, greenfield remote-job and adapt-upgrader routes, three sites, Standard seed 1 and Real seeds 1–3. Both sides enable wear, livestock and Finance; only riskEvents differs. Greenfield retains zero survival-short days, end cash $0–$1,238 lower. Adapt has 0–12 survival-short days versus zero with risks off, exposing grid dependence; cash changes −$247 to +$15, including reduced utility deliveries during outages. Minimum wellbeing remains 75.2 greenfield / 75.8 adapt (earlier than transient exposure). Controlled cases: garden harvest 0.059 → 0.100 lb/day with operating defense; repair averts a breakdown, otherwise $440 covered payout; refuge exposure 1.5 → 0.375 wellbeing points/day; reserves supply 6,000 kcal through three closed-road days versus zero without them; fueled generator makes 2.57 kWh/day with grid imports zero; well/rain output 196.15 → 89.36 gal/day under drawdown. Defaults unchanged; LL-39 next in Upgrade Roadmap 2.

**Validation:** **484/484** unit tests, including 14 new engine regressions and 2 catalog checks; **74/74** complete browser tests, including the warning → closed-road delivery queue → one resumed delivery → Almanac flow. Typecheck, lint, production build, catalog consistency, pacing gates, parity and legacy digest assertions pass. Final targeted replay regression explicitly snapshots both pending and active smoke warnings and passes JSON continuation; two-year weather draws and existing predator results match with the gate off/on. Visually inspected `docs/screenshots/ll-38/blizzard-warning.png`; all other screenshots were backed up and restored after the browser suite. Used `node --import tsx` for catalog/comparisons/pacing and approved local preview/Chromium access for browser verification.

**Limits:** interval-based experimental hazard rates, not regional forecasts; no spatial smoke plume/fire damage, pest species, disease transmission, aquifer-volume model, road clearing or grid-repair crews. Indoor refuge reduces exposure without adding an air-quality catalog resource. Disease defense is an explicit soil-care game rule. Only configured delivery backstops and market trips close; employment/trade access remains LL-39 scope. Finance insurance covers failed equipment, not crops or lost income. Comparison bots retain their policies rather than optimizing responses to warnings.
## October 25, 2026 — Phase 9, LL-39 transportation as access (one ticket)

**Shipped:** engine **0.19.0**, explicit opt-in `transportAccess` under Settings → Experimental mechanics → Transportation as access. Removes the flat resident travel request and wellbeing drift; actual market/physical-supply/sale errands share one daily 10-mile trip or $25 delivery. On-site commutes follow catalog travel-to-work-hours ratios at allocated labor, with a $0.50/mile paid alternative; remote work needs no commute. Other supply access follows operating share. Necessary town journeys use measured person-miles or a $25 household ride; zero-cash emergency rides leave visible fares payable, settled partially or fully from later cash without overdrawing. LL-38 road closures block commuting, sale collection and returns as well as deliveries; emergency departure remains possible. A failed fare preserves queued orders; full destination storage causes no trip/charge. Transportation access remains a measured attempted/completed row outside household coverage and self-reliance, with card/forecast explanations and a Market trip/fare summary. Daily access records and optional saved fare liability preserve cash reconciliation, replay and JSON continuation; gate-off pauses unpaid fares and restores legacy behavior. New quantities/source lists are validated overrides; workbook human/job transportation flows and parity remain unchanged. Details: `docs/LL_39.md`; save contract: `docs/SAVES.md`.

**Measurement:** `docs/LL_39_COMPARISONS.md` (reproduce with `node --import tsx packages/cli/bots/access.ts`): 72 matched first-year runs, remote/part-time greenfield and adapt-upgrader, three sites, Standard seed 1 and Real seeds 1–3. Other experimental gates remain off on both sides. Every route retains zero survival-short days. Remote: minimum wellbeing 75.2 → 75.4, cash +$111–$1,920, 58–72 errands costing $1,450–$1,800/year. On-site part-time: paid commutes enable wages, cash +$27,465–$27,655 after $3,403–$3,673 in trip fares. Adapt: 729 completed commute/errand entries, measured vehicle mileage covers access without paid alternatives, cash about +$4,618. Ordinary routes have no blocked trips or fare liabilities; regression fixtures cover those failures. Score improvements include removal of a denominator and comfort drift, not invented supplies. Defaults unchanged. Phase 9 is complete; LL-40 (Water) is next in Upgrade Roadmap 2.

**Validation:** **497/497** unit tests, including 11 new engine regressions and 2 catalog checks; **75/75** complete browser tests, including the idle access row → two queued orders → one paid errand → measured Market/checklist flow. Final targeted access and information browser tests pass after card/display adjustments. Typecheck, lint, production build, catalog consistency, all pacing gates, parity and legacy digest assertions pass. Additional targeted regressions verify real emergency departure fare replay/JSON continuation, partial repayment, full-storage trip suppression, and a consistent mixed-history checklist when the gate is disabled. Visually inspected `docs/screenshots/ll-39/transport-access.png` with toasts dismissed; other screenshots backed up before the browser suite and restored afterward. Used `node --import tsx` for catalog/comparisons/pacing and approved local preview/Chromium access for browser checks.

**Limits:** no route map, trip-time labor, seat/cargo limits, weekday employment calendar or marginal per-trip fuel model. Mileage is previous-day actual production, not a multi-day bank; end-of-day returns can use newly measured output. Vehicle costs/output retain catalog rates. Annual design forecasts omit trip scheduling/fares and label that limitation. Emergency fare liabilities carry no interest and pause when the experiment is off; ordinary commuting cannot defer fares.
## October 25, 2026 — Phase 10, LL-40 water and LL-41 processing

**Shipped:** engine **0.20.0**, eleven workbook-backed systems added through `catalog_patch.py` (five water, six food), three canonical resources and regenerated catalog/goldens. LL-40 adds a node-connected spring box with shared site flow, a first-flush diverter, potable-only tank, built-in heat-traced raw tank and paid/labor-limited water-test warning. LL-41 reuses existing pressure canning and solar drying, adds water-bath/electric/smoke processing recipes, milk-to-cheese and produce-to-seed conversions, and staffed rodent-protected grain capacity. Actual food inputs, losses, energy and labor reconcile; converted cheese is not a new harvest or household meal. UI exposes recipes, measured warnings, spring connections and winter heating. Uses existing `storagePools`, `foodPreservation` and `riskEvents` gates; defaults unchanged. No dependencies. Workbook patch reports verify **zero existing typed values changed**. Details and limits: `docs/LL_40.md`, `docs/LL_41.md`; save notes in `docs/SAVES.md`. LL-42 is next in Upgrade Roadmap 2.

**Measurement:** reproduce both `LL_40_COMPARISONS.md` and `LL_41_COMPARISONS.md` with `node --import tsx packages/cli/bots/water-food-expansion.ts`. Controlled Standard/seed-1 equipment checks across the three sites: a potable tank retains 100 additional gallons; a connected spring box pipes 175 gal/week for 0.25 h upkeep (Asheville has no spring); a wind/battery-powered trace prevents 25 frozen tank-days on the Front Range and 98 in Laramie over 120 days, spending 3.0/50.4 kWh. Electric drying converts 6,000 → 5,400 kcal using 4.8 kWh; smoking converts 6,000 → 5,100 using 3 lb wood. A grain bin cuts 30-day grain losses from 3.454 to 0.136 lb at equal 40-lb consumption. Seven days of stations converts 1.25 gal milk → 1 lb cheese and 1 lb garden output → 1 oz seed. These isolated fixtures supply food/cash and disable wellbeing drift; no first-year survival-route improvement is claimed.

**Validation:** **512/512** unit tests, including 13 new engine scenarios and 2 catalog checks; **77/77** complete browser tests, including two new flows for the kit/checklist warning and electric drying. Typecheck, lint, production build, catalog consistency, parity, unchanged legacy digest assertions and pacing gates pass. Visually inspected `docs/screenshots/ll-40/water-test-warning.png` and `docs/screenshots/ll-41/electric-dehydrator.png`. Backed up and restored all 164 existing screenshot files byte-for-byte after the full suite. One unit rerun overlapped browser rendering and exceeded the 150-ms performance threshold (180 ms); the subsequent complete unit run alone passed at 83.5 ms, without changing the test. Local browser/server execution used approved access after sandbox `listen EPERM`.

**Limits:** spring placement approximates gravity without elevation/head, first-flush source mixing remains pooled with previous-day readiness, potable tank is assumed indoors, kit warnings are precautionary rather than pathogen tests/illness events, water-bath acidity/curing additives are abstracted, cheese has no aging/whey recovery, and seed saving has no cultivar/seed-cycle model. Phase 10's broader two-source audit remains open for LL-42 onward.

## October 25, 2026 — Phase 10, LL-42 animal feed and fodder

**Shipped:** engine **0.21.0**. Three systems added through `catalog_patch.py`: Hay Meadow (1/10 acre), Poultry Feed Mix and Hay Barn; new Feed storage capacity in canonical cu ft. Workbook diff confirms zero existing typed values changed; catalog/goldens regenerated. Meadow footprint uses real parcel space, hay follows the growing season and rainfall/drought, winter keeps only upkeep. LL-34 scythes reduce cutting labor without raising the land ceiling; cutting and gathering share eight hours/tool/day, including reused idle labor. Real grain/greens/grubs inputs become poultry feed at a lossy 10:9 ratio, separately from household meals. Barn adds 200 cu ft to LL-33's shared feed pool without providing tool space; passive capacity, condition, cards, resource pages and deliveries agree. Existing placement/settings actions, optional saved cutting records, no new toggle, dependency or default changes. Details: `docs/LL_42.md`; save contract: `docs/SAVES.md`. Upgrade Roadmap 2 marks LL-42 implemented, LL-43 next.

**Measurement:** `docs/LL_42_COMPARISONS.md`, reproduced with `node --import tsx packages/cli/bots/fodder.ts`: 24 full-year meadow fixtures (three sites, Standard seed 1 / Real seeds 1–3, hand/scythe), four finite mixing checks and two shared delivery checks. Scythes leave each fully staffed hay yield unchanged. Front Range Standard: 208.57 lb hay, meadow labor 15.64 → 9.56 h; scythe upkeep adds 5.21 h, so the separate 6.08 h cutting saving is only 0.87 h net for a scythe bought solely for this plot. Laramie Standard: 152.95 lb because of rainfall scaling; a poor year can save less cutting labor than the tool's upkeep. Seven-day feed batch: 7 lb grain + 2 lb greens + 1 lb grubs → 9 lb feed, 1 lb loss and 1 h labor; missing any ingredient yields zero. Barn/bins accept 1,900 lb hay plus 400 lb feed together; bins alone accept 95 lb hay and leave the other orders queued. Fixtures supply household stocks and disable wellbeing drift; no survival-route gain is claimed.

**Validation:** **527/527** unit tests, including 13 new engine scenarios and 2 catalog checks; **79/79** complete browser tests, including two new meadow/feed-storage flows. Typecheck, lint, production build, catalog consistency, parity, unchanged legacy digest assertions and pacing gates pass. Final targeted checks cover meadow/card calculations without water rules, passive/failed barn capacity, and a second idle-labor gathering pass that cannot reset scythe hours. Visually inspected `docs/screenshots/ll-42/scythe-meadow.png` and `docs/screenshots/ll-42/feed-storage.png`. Existing screenshot bytes backed up before browser execution and restored afterward. Browser/server execution used approved local access. Catalog count/modding fixtures now use 192 systems, 855 flows, 67 resources and next unused IDs; existing assertions remain strict.

**Limits:** seasonal smoothing rather than mowing/drying dates, no hay moisture/spoilage or barn fire, no nutrient/mineral inventory, conservative cutting reservations can leave tool time unused after curtailment. Feed mix ratios, labor, usable barn volume, costs and rainfall response are labeled game assumptions; CSU hay-yield and extension storage/feed references are recorded in row notes and LL-42 documentation. Existing pasture is unchanged; the remaining Phase 10 audit belongs to subsequent tickets.


## October 25, 2026 — Phase 10, LL-43 livestock lifecycle infrastructure

**Shipped:** engine **0.22.0**. Four systems added through `catalog_patch.py` (zero existing typed values changed): Egg Incubator (24 eggs), Broody Hen Nest Box, Predator-Proof Run (12 birds) and Rotational Paddock Kit. New override rule `livestockInfrastructure` with exporter validation. A logged `hatch` action sets or cancels a clutch: eggs are held back from meals until a full clutch is in stock, then drawn as `processed`; 21 counted days follow (incubator: 0.5 kWh and 80% upkeep a day; nest box: a free mature hen within 30 ft, set only with 13+ h daylight, who stops laying while sitting). More than two missed days, or losing the hen, fails the clutch. Hatches become an LL-31 Baby Chicks cohort through a placement helper shared with breeding. Staffed runs protect whole poultry cohorts within 20 ft, up to 12 birds each, as a third LL-31 protection. A kit on a pasture multiplies its Hay and Green biomass by 1 + 0.15 × yesterday's moving labor met × condition. Hatching and the run use `livestockLifecycle`; no default changes. Details: `docs/LL_43.md`; save contract: `docs/SAVES.md`.

**Measurement:** `docs/LL_43_COMPARISONS.md`, reproduced with `node --import tsx packages/cli/bots/husbandry.ts`. A June clutch at every site: incubator 24 eggs + 10.5 kWh → 16 chicks; nest box 8 eggs → 6 chicks for 10–11 eggs not laid; the $5 breeding service gives one chick per hen. A year of predators (seeds 1–3): 5–6 hens lost unprotected, none with a staffed run (13.04 h upkeep). A rotated 1-acre pasture: hay 1,564 → 1,798 lb and greens 1,043 → 1,199 lb for 52 h; the existing pasture ignores site and weather, so sites match.

**Limits:** a mature hen stands in for a fertile flock; whole clutches hatch on day 21; no humidity, turning or candling; the paddock models no rest periods or stocking rate. Grazing evidence is mixed (UF/IFAS vs the 2008 rangeland review), so the 15% is a conservative assumption.

## October 25, 2026 — Phase 10, LL-44 waste, soil and sanitation

**Shipped:** engine **0.23.0**. Five systems added through `catalog_patch.py` (zero existing typed values changed): Manure Windrow, Leaf Litter Gathering, Sawmill Sawdust Pickup, Cover Crop Seeding and Laundry Station. The windrow, carbon sources and laundry are ordinary workbook flows. Laundry is tagged Sanitation; tagging it Water-System took that category to 21 of its 3–20 target, so the patch was rebuilt from the pre-LL-43 workbook with the tag fixed, giving a clean diff (the LL-43 diff regenerated byte-identical). Cover crop seeding is an optional `soilFertility.seeding` rule: 200 sq ft of gardens within 30 ft, sown in a weeks-35–41 window (flow-timing override on F0873), saving the sown share as `Instance.sown`; resting gardens then gain up to 0.15 fertility a year, scaled by coverage, upkeep and sown share. Details: `docs/LL_44.md`.

**Measurement:** `docs/LL_44_COMPARISONS.md`, reproduced with `node --import tsx packages/cli/bots/waste-soil.ts` (municipal water in every fixture; an earlier draft ran the cistern dry at day ~125 and used unlimited supply that backfilled the windrow's manure, both fixed). A 12-hen coop's 926 lb of manure + 462 lb carbon → 770 lb compost in 30.8 h. A composting outhouse with no carbon: 0% sanitation; with leaf litter (78 h) or sawdust ($313, 13 h) 94–96%, the same as with ample carbon. A tired bed: 0.298 → 0.354–0.359 by December in the first year. Laundry: 1,040 gal hot water → 2,340 gal greywater and 260 wellbeing points for 104 h.

**Limits:** carbon sources are even through the year; no pile temperature or curing; no cover-crop species or nitrogen; laundry is an extra activity on top of unchanged human water use.

## October 25, 2026 — Phase 10, LL-45 heat, hot water and shelter efficiency

**Shipped:** engine **0.24.0**. Three systems added through `catalog_patch.py` (zero existing typed values changed): Canvas Tent Winter Liner (host modifier, canvas shelters' heat need × 0.75), Wood Boiler with Water Jacket (steady wood by override on F0881 → seasonal heat plus 140 gal/week hot water) and Draft-Proofing Kit (seven small hard shelters: heat × 0.85, cooling × 0.9). **Hot water decision:** not a scored checklist row (workbook parity; already a wellbeing comfort need). The measured checklist shows an unscored "Hot water (comfort, not scored)" line from ledger requested/unmet. Details: `docs/LL_45.md`.

**Measurement:** `docs/LL_45_COMPARISONS.md`, reproduced with `node --import tsx packages/cli/bots/heat-efficiency.ts`. Liner on the starter tent in winter: heat need −25% everywhere; Laramie heat met 80.5% → 98.9%. Draft-proofed tiny house: heat −15% (Laramie 13.75 → 11.69 MBTU/yr), cooling −10%. One adult's hot water: boiler, propane tankless and solar heaters each 99.7% met; the boiler burns 2,607 lb wood/yr, propane 31.3 gal.

**Limits:** fixed multipliers; draft-proofing multiplies with the whole-house retrofit (overstates if both are bought); summer boiler heat is unused.

**Validation (LL-43 to LL-45 together):** **558/558** unit tests (31 new: 10 hatching/run/paddock, 8 waste/soil, 7 heat, 6 catalog), including pacing gates, parity and unchanged legacy digest assertions; **83/83** complete browser tests (4 new). Typecheck, lint, production build and `catalog:check` pass. Catalog fixtures now use 204 systems, 884 flows, 67 resources and the next unused IDs (S205, F0885). Visually inspected `docs/screenshots/ll-43/incubator.png`, `ll-43/paddock.png`, `ll-44/cover-crop-seeding.png` and `ll-45/hot-water-comfort.png`. All 166 existing screenshot files backed up before the full run and restored byte-for-byte afterward. LibreOffice 26.8.1 was installed with Homebrew (user-approved) to run the patch script. Upgrade Roadmap 2 marks LL-43 to LL-45 implemented; LL-46 is next.

## October 25, 2026 — Phase 10, LL-46 income and trade

**Shipped:** engine **0.25.0**. Two systems and one resource added through `catalog_patch.py` (zero existing typed values changed): CSA Share Program (4 half shares), Spinning Wheel and Loom, and Woolen goods (canonical lbs, $25/lb sale-only reference). The farm stand and Ruth's produce barter already shipped in LL-29 and are unchanged. New override rule `incomeTrade` with exporter validation. The CSA's flows are growing-season by timing override; it runs under `sellingAndTrade`, earns for the share of boxes packed and pays a 50% make-good on the missing revenue, capped by cash under the floor (`DayLedger.csa`, `DaySpend.makeGood`, "CSA make-good" bill). Labor barter is a `sell` order with `resource: 'Labor'` and a goods choice, filled from spare labor at $12 of goods per hour after the tutorial. Woolen goods, like Cheese, stay out of stocks, ledgers and the legacy balance serializer until used, so committed legacy digests are unchanged (a first full run caught this). The CSA bypasses the spatial cache, which is not keyed on the trade setting. Details: `docs/LL_46.md`; save contract: `docs/SAVES.md`.

**Measurement:** `docs/LL_46_COMPARISONS.md`, reproduced with `node --import tsx packages/cli/bots/income.ts`. A fully supplied CSA earns $2,346 for 104 h at every site (the annual total spreads over 98–184 growing days); with no produce it pays $1,173 in make-goods; a half-season stockpile lasts about three weeks because household meals eat perishable produce first. A year of wool (26 lb) → 23.4 lb woolen goods for 208 h, $292.50 at the 50% sale rate against $52 raw: $1.16 added per hour. 48 h of spare work bought 1,646 lb of chicken feed with no cash.

**Validation:** **569/569** unit tests (11 new: 9 engine, 2 catalog), including pacing gates, parity and unchanged legacy digests; **84/84** complete browser tests (1 new). Typecheck, lint, production build and `catalog:check` pass. An LL-29 test's expectation that labor cannot be sold for cash still holds unchanged. Catalog fixtures now use 206 systems, 891 flows, 68 resources and next IDs S207/F0892. Visually inspected `docs/screenshots/ll-46/csa-make-good.png`; existing screenshots backed up and restored byte-for-byte.

**Limits:** no CSA cancellations, box mix or produce reserve; spinning is one abstract rate; Ruth's goods and work are unlimited. Prices, rates and the make-good are labeled game balance. LL-47 (catalog audit gates) is next.

## October 25, 2026 — Phase 10, LL-47 catalog audit gates

**Shipped:** no simulation change (engine stays **0.25.0**, no workbook rows). `catalogAudit` (`packages/engine/src/views/audit.ts`) checks the exported catalog against the three sites for dead-end Flow resources, survival inputs with fewer than two non-market sources, and systems with no site that can supply every input. `auditGates` turns findings into failures unless a reviewed exception covers them, and flags stale exceptions. Exceptions live in `data/catalog_overrides.json` (`auditExceptions`, each with a reason and optional follow-up; schema plus exporter name checks). `npm run catalog:audit` regenerates the marked audit section of `docs/CATALOG.md` and exits 1 on a failure or stale exception; `CLAUDE.md` lists the command. Details: `docs/LL_47.md`. Phase 10 is complete; LL-49 is next (LL-48 shipped October 23).

**Findings:** no dead ends (wool now has a sale price and the LL-46 spinning wheel); 204 of 205 systems can be supplied at all three sites (micro-hydro needs Asheville's stream). Nine survival inputs have fewer than two non-market sources and pass as reviewed exceptions: Chicken feed, Gasoline, Grain, Milk, Root crops, Seedlings, Waste lumber, Wood chips, Wood pellets. Real gaps worth follow-up: no market sells seed grain or seed potatoes, so a first grain plot or potato patch needs seed in stock.

**Validation:** **575/575** unit tests (6 new, including fixtures that prove each gate fires and that a stale exception fails, plus a check that the published section is current); **84/84** complete browser tests. Typecheck, lint, production build, `catalog:check` and `catalog:audit` pass. Existing screenshots backed up and restored byte-for-byte.

**Limits:** supply is checked one level deep; source counts treat each producer and each node kind as one source, regardless of size or season.

## October 25, 2026 — Phase 11, LL-49 alert-coverage tests

**Shipped:** no simulation change (engine stays **0.25.0**). `packages/cli/bots/coverage.ts` defines six survival cliffs (food, safe water, Carbon, fuel, chicken feed, cash), each with its cliff day (first wellbeing penalty, or for feed and cash the first shortfall) and the alert ids that warn of it. A cliff passes when one of its alerts was listed in an allowed section every morning for 7+ days before it (feed 6: the consumable alert lists once fewer than seven whole days remain). The forecast is reported but never counts. `noviceBot` now records the full ranked list it sees (`shown`), and `playBot` accepts a start definition for stress starts. `npm run sim -- coverage` writes `docs/LL_49_COVERAGE.md` and exits 1 on a miss. Details: `docs/LL_49.md`.

**Measurement:** novice gate runs (3 sites × 3 seeds) reach no cliff. October 22 playtest (original line, alerts ignored): Carbon on every site, warned 10–11 days ahead at rank 1; Laramie firewood, 17–19 days. No water gathering: safe water warned exactly 7 days ahead. $600 cash: cash 19–29 days, feed 6, food 7–9, Laramie fuel 8. Every cliff is reached on every site except fuel (Laramie only), which the test encodes.

**Validation:** **578/578** unit tests (3 new: the sweep, a hidden-runway fixture that fails, and Comfort-only warnings that don't count). Typecheck and lint pass. No UI change, so no browser run.

**Limits:** greenfield only; stress starts are edited greenfield kits; water and food leads sit right at the 7-day threshold.

## October 25, 2026 — Phase 11, LL-50 strategy comparisons in CI

**Shipped:** no simulation change (engine stays **0.25.0**). `npm run test:comparisons` (`sim compare --ci`) runs the LL-10 suite under two profiles, new-game rules and new-game rules with all twelve experimental mechanics on, so a change to a gated mechanic shows up even though a new game leaves it off. It fails on a stale report (`docs/PHASE_4_COMPARISONS.md`, new `docs/PHASE_4_COMPARISONS_EXPERIMENTAL.md`), on a headline that differs from `docs/comparisons/headlines.json` (departures, median short days, lowest wellbeing, end cash to $100, home-grown share to 1%), and when the headlines' digest has no finished note in `docs/COMPARISON_NOTES.md`. `--update` regenerates everything and opens a `Why: TODO` stub listing the moved headlines. New nightly workflow `.github/workflows/nightly.yml` (07:17 UTC and manual) uploads the regenerated files on failure. `runComparisons` takes settings; `EXPERIMENTAL_MECHANICS` lives in `bots/run.ts`. Details: `docs/LL_50.md`.

**Measurement:** both profiles in about 15 s. The first run caught real drift: the committed report's tutorial gifts were $3,248, now $3,273 after Phase 10 catalog prices; no new-game headline moved. Experimental profile: everyone stays home except Laramie's paid crew for the late heater (15 days in town); home-grown food 12–13% vs 19–22%.

**Validation:** **582/582** unit tests (4 new). Typecheck and lint pass. Tampering with one committed headline fails the check with the diff; restoring it passes. No UI change, so no browser run.

**Limits:** medians hide a single bad seed except through the departure count; the experimental profile turns every gate on at once, so it says that something moved, not which gate. The nightly job reports; it does not commit.

## October 25, 2026 — Phase 11, LL-51 more sites and starts

**Shipped:** engine **0.26.0**. Three site presets with approximate NOAA normals: **Sonoran desert, Arizona** (`tucson-az`: 3,600 CDD, 11.2 in of rain, a 10 gal/h seep and monsoon rain pools, no creek), **Puget Sound lowland, Washington** (`olympia-wa`: 49 in of rain, 3.4 sun hours, a creek and a spring that does not fail in a dry year) and **Lake Superior shore, Michigan** (`marquette-mi`: 8,600 HDD, a 128-day season). Optional `Site.hazards.riskChanceMult` scales LL-38 risk chances under `riskEvents` without changing the draw count: desert smoke ×2 and drawdown ×1.5, coast disease ×2 (mold and blight), lake blizzards ×2. Two starts: **off-grid cabin** (paid-off log cabin, small solar, cistern, $6,000, no job) and **small farm** (farmhouse on the grid, well, cistern, full-time job, two cars, hens, goats, pasture, $12,000 and a $280,000 mortgage at 6.5% over 30 years; turns on Finance, Selling and trade, and Transportation as access). New `FinanceState.mortgage`: daily accrual and daily installments of the monthly payment, arrears paid first, no penalty, paused with Finance off; shown in the Finance panel. Starts gain `household.maxChildren`, `settings` and `mortgage`; the start screen offers children (LL-36 child role, turns on household roles, stockpile scales by 0.7 per child). The web app's old custom-game quest line no longer shows for games from a start. Details: `docs/LL_51.md`; save notes: `docs/SAVES.md`.

**Measurement:** every gate now runs on all six sites. Existing gates pass on the new sites (Tucson needed the seep: without reliable water, idle and tutorial households died of thirst by day 40). New gates: `cabin-idle` (first hardship day 46–47), `cabin-novice` (leaves day 261–278 when cash runs out, every departure warned), `farm-idle` (no missed installment, $23,500–$24,200 at the end), `farm-family` (2 adults + 2 children home all year). The farm took three passes: one car and a part-time job left the commute without miles, and without a cistern the filter stopped for larger households. Households above the default still start below coverage on every start (the farm with 4 adults leaves day 74; greenfield with 4 adults on day 16). LL-49 coverage passes on all six sites; LL-50 headlines unchanged.

**Validation:** **611/611** unit tests (16 new engine tests for sites, hazards, mortgage, children and replay; a farm-gate teeth test; pacing, coverage and audit expectations widened to six sites). **86/86** browser tests (2 new: the farm family with its mortgage, the desert cabin). Typecheck, lint, build, `catalog:audit` (refreshed for six sites) and `test:comparisons` pass. Visually inspected `docs/screenshots/ll-51/farm-start.png` and `mortgage.png` (fixed a rate shown as 7% instead of 6.5%, and a stray custom-game quest toast). Other screenshots backed up and restored byte-for-byte.

**Limits:** no roof snow load, indoor mold or heat stress on people; no foreclosure or refinancing; kits don't scale with the household; the new starts have no quest line.
