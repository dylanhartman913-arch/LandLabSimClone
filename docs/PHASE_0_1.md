# Phase 0 audit and Phase 1 delivery

October 16, 2026. Based on `UPGRADE-ROADMAP.md` in the parent workspace.

## Working copy and baseline

The server at localhost:5173 runs from `/Users/dylanhartman/Claude/LandLab Sim/LandLabSimClone-claude-gifted-hypatia-x158zw/apps/web`. That extracted directory has no `.git` directory. Work was isolated in this workspace's `LandLabSimClone` directory; the original running source was not edited. Local branch: `codex/phase-0-1`. Commit `60fad89` records the imported source snapshot, not upstream GitHub history. No GitHub push or pull request was made.

The source snapshot passed all 222 unit tests before implementation. Dependencies were copied from the existing installation; no dependencies were added and no catalog quantities were edited.

## Phase 0 — code map

| Mechanic | Source | Responsibility |
|---|---|---|
| Catalog | `packages/catalog`, `data/source`, `data/catalog_overrides.json` | Workbook-derived quantities and engine-only metadata |
| Live lifecycle | `packages/engine/src/time/game.ts`, `step.ts` | Placement, construction, daily allocation, production, stock and ledgers |
| Food allocation | `time/step.ts`, now shared `time/food.ts` | Direct requests precede substitutions; planting reserves are withheld from meals |
| Gathering / work | `time/gather.ts`, `step.ts` | Priority/cap allocation, walking, fetching, boiling and construction competition |
| Weather / rates | `time/climate.ts`, `plans.ts`, `weather.ts` | Deterministic daily shaping and seeded weather |
| Wellbeing / town | `time/wellbeing.ts`, `step.ts:updatePeople` | Need penalties, labor factor, departure and return |
| Annual forecast | `balance/feasible.ts`, `views/hud.ts` | Feasible steady-state design, without live stocks or gathering |
| Measured UI | `views/checklist.ts`, `resources.ts`, `card.ts`, `people.ts` | Ledger windows, system cards, reserves and explanations |
| Planning | `views/scenario.ts`, `apps/web/src/ui/Plan.tsx` | Scenario comparisons and sensitivity; weather simulation via worker/CLI |
| Save/replay | `replay.ts`, `apps/web/src/lib/saves.ts`, `store/game.ts` | Initial conditions, action replay, state digest and browser report list |

## Durable reproduction fixtures

Exported both browser slots through the game's export UI. Checked in only the initial conditions, actions, expected cash/wellbeing and original simulation digest; omitted the large redundant snapshot and export timestamp.

| Fixture | Day | Cash | Original digest |
|---|---:|---:|---|
| `packages/engine/test/fixtures/playtest/spring.json` | 57 | $7,784 | `9544bdc2fdf7f9cf` |
| `packages/engine/test/fixtures/playtest/winter.json` | 240 | $10,829 | `f90dc93c4f4d1a4a` |

Both replay exactly with Phase 1. The winter fixture can also be replayed to day 114 to reproduce hunger with seed potatoes still in stock. Run, for example:

```sh
node --import tsx scripts/replay-playtest.ts packages/engine/test/fixtures/playtest/winter.json 114 > /tmp/landlab-hunger-state.json
```

The original browser's on-screen day-238 replay was exported before visiting the slots and restored afterward. Neither slot was overwritten.

## Findings classified against source

| Finding | Verified cause | Disposition |
|---|---|---|
| Unfinished shelter credited as Actual | `designCounts` includes buildings in progress; default checklist was annual feasible balance. Live grouping skips buildings in progress. | Phase 1: explicit planned/completed forecasts; measured default and regression coverage. No early live shelter credit was found. |
| Positive food runway during hunger | HUD counted the entire food family, while the allocator protects a season's seed potatoes. | Phase 1: same planting-reserve helper used by simulation and HUD. |
| Building card shows output | Card fell back to catalog output without a live group; a same-system active group could also be inherited. | Phase 1: unfinished cards show zero output and explicit basis. |
| Used construction soil shows 0 supplied | One-time material was interpreted as yesterday's recurring input. | Phase 1: supplied-during-construction state. |
| Labor discrepancies | HUD added only construction and upkeep; Work introductory number was the whole available pool. | Phase 1: shared totals plus employment/maintenance/gathering/construction breakdown. |
| Filter blocked label contradicts bars | Catalog status used annual balance; bars used recent design availability. | Phase 1: catalog explicitly preview-only; live status shown only with instance measurements. |
| Sensitivity baseline differs | UI omitted `ambient` and `delivered` when constructing the sensitivity design. | Phase 1: reuse full `designForGame`; label its baseline a planned forecast. Fine-grained sensitivity presentation remains Phase 3. |
| Seven-day water target exceeds storage | Gathering target uses raw plus drinking demand; storage is pooled with a buffer. Setting the target does not validate feasibility. | Phase 1: completed-storage warning. Quest completion semantics remain Phase 2. |
| Town return into cold home | Return checks minimum time away, other present residents' shortages, shelter existence, prepared food and drinking-water stocks. It does not explicitly test prospective heat coverage. | Confirmed mechanic; Phase 2 recovery design. |
| High report health beside low wellbeing | Report averages the engine's `health` (labor factor), not displayed wellbeing. A day with no present residents records health 1. | Confirmed metric mismatch; Phase 2 report/priority work. |
| Reports disappear on load | `loadGame` explicitly resets `reports: []`; replay restores engine state, not this browser list. | Confirmed; Phase 5 persistence work. |
| Manual soil remains after construction | `startConstruction` imports missing one-time materials for free before the scheduled market delivery. Manual order is still delivered and paid for. | Not a second automatic charge. Procurement clarity/pending-order reconciliation remains future work. |

The flat sensitivity screen was not sufficient evidence that all perturbations were broken: the omitted ambient supply changed the model, and integer percent formatting can conceal small changes. Phase 1 aligns the baseline; broader sensitivity UX remains separate.

## Phase 1 — implemented behavior

### LL-01: Current operations and forecasts

- Checklist defaults to **Current operations** over the last seven measured days.
- **Completed design forecast** excludes construction; **Planned design forecast** includes it as completed and mature, including spatial modifiers.
- Annual forecasts state their assumptions: mature systems, steady site conditions; no stockpiles, gathering, market orders or construction time.
- HUD coverage uses daily ledgers, so paused purchases cannot improve it.
- Empty measured windows remain empty instead of silently displaying a forecast. A season boundary no longer labels the previous season as this season.
- Capacity summaries use capacity units rather than weekly production units.
- The design strip is explicitly a separate forecast; unfinished systems are marked.
- Sensitivity now uses the same complete planned-design inputs as the annual forecast.

### LL-02: Usable reserves

- Food runway counts only accepted meal substitutes after protected planting reserves and direct requests such as milling or seed applications.
- Why explanations list each stocked food's available and planting-reserved quantities; future harvests and purchases are excluded.
- Drinking-water explanations explicitly exclude raw water and future filtration.
- Work warns when the requested raw-plus-drinking reserve exceeds completed pooled storage. An unfinished cistern cannot clear that warning.
- This warning is a feasibility check, not a guarantee that labor, replenishment and filtering will sustain the target.

### LL-03: Consistent labor and status

- HUD and Work share the same worked/available/idle totals. Gathering includes walking and boiling.
- Work separates employment, maintenance, gathering and construction without counting employment twice. Paid jobs retain the same existing system-work priority.
- Cards identify catalog previews, unfinished projects, unmeasured completed systems and yesterday's operating-rate equivalents.
- Unfinished instances cannot borrow another instance's output; one-time construction materials remain marked supplied.
- Live capacity is shown independently from recurring output curtailment.
- Tiny floating-point residuals format as zero; simulation precision is unchanged.

No prices, yields, starter kits, tutorial rewards, wellbeing rules, town mechanics, catalog goldens or save schema were changed. Existing simulation digests remain valid.

## Validation

Validation results:

- **239/239 unit tests pass** (222 baseline plus 17 new regressions).
- **15/15 pacing gate groups pass**, across 3 sites and 3 seeds.
- **Catalog consistency, typecheck, lint and production build pass.**
- **Full browser suite: 44/46 pass**; both failures were reproduced on the unchanged source snapshot as described below.
- **Affected browser suite: 11/11 pass** after final coverage/labor display changes. The two new accounting browser cases also pass against the final food-reserve calculation.
- Both exported playtest state digests and all existing simulation regression digests remain unchanged.

 Browser checks use the installed Google Chrome and the repository's Playwright suite, not the original game tab.

Two browser failures were separately reproduced on the untouched snapshot `60fad89` using a detached worktree and port 4175:

1. Tablet drawer collapse: immediately measured height is 495.59375, expected less than 40 (`ship.spec.ts:53`).
2. Five blocked systems: map double-click fails to open the Composting Outhouse card (`sources.spec.ts:55`).

The same assertions failed with and without Phase 1. They were not deleted, skipped, relaxed or fixed outside this phase. Baseline traces remain under `/private/tmp/landlab-phase01-baseline/test-results/`.

Existing tests that intentionally inspect annual forecasts now explicitly select that view. Their numeric and spatial assertions were preserved. New regression cases cover the actual exported saves, construction eligibility, planting reserves, labor reconciliation and water target feasibility.

## Next work

Phase 2 should address zero-labor recovery and safe return from town, survival-first alerts, and tutorial claims. Keep balance changes separate until those mechanics and their regression cases are specified. The preserved winter fixture is the starting reproduction, not a justification to increase cash automatically.
