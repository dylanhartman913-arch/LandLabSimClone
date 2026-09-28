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
