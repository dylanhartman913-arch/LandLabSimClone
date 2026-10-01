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
