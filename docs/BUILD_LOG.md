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
