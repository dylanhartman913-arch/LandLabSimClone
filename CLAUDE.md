# CLAUDE.md — homestead-sim

Read this file, the current session's section of `docs/HOMESTEAD_SIM_ROADMAP.md` (G0–G10) or `docs/HOMESTEAD_SIM_PLAYABILITY_ROADMAP.md` (G11–G16), and the last entry of `docs/BUILD_LOG.md` before writing code.

## What this repo is
A top-down homestead planning simulator. Players place systems (shelters, panels, gardens, animals) on a parcel; each system draws inputs and makes outputs; a Human Needs Checklist scores how well the design covers a household. The engine is meant to be decision-grade: deterministic, unit-consistent, and able to explain every number.

## Source of truth
- `data/source/LandLab_Sim_Systems_v2.xlsx` is the catalog. Never hand-edit catalog numbers in code or in generated JSON.
- Engine-only fields go in `data/catalog_overrides.json`.
- Run `npm run catalog:export` after any change to either; commit the regenerated files in `packages/catalog/generated/`.

## Hard rules
1. `packages/engine` is pure TypeScript: no React, Pixi, DOM, `Math.random()`, or `Date.now()`. Randomness comes from the seeded RNG in state.
2. Every resource has one canonical unit (Resources sheet). Never mix capacity and amount in one field. Display converts units; the engine does not.
3. Parity with the spreadsheet is a contract. If a parity test fails, fix the engine, never the golden.
4. Every number the UI shows must come from the engine with provenance (`explain`). No arithmetic in React components.
5. Undo stack lives in the Zustand store, not the engine.
6. Original name, art, and copy only. Do not copy sprites, icons, logos, or text from the reference game.
7. The checklist and every score use **actual** (realized) flows from the engine. **Potential** (nominal) flows are shown only as a labeled ceiling. Spreadsheet parity applies to potential values.
8. New catalog systems are added as rows in the xlsx through `scripts/catalog_patch.py` (reviewable diff, same columns and formulas as existing rows), never only in JSON or overrides.
9. Pacing is tested. The playtest bots in `packages/cli/bots/` must pass their gates in CI.

## Working in the cloud sandbox
- Start: `npm ci`. If install fails, note it in the build log and choose a dependency-free path.
- Dev server: `npm run dev -- --port 5173 &`, wait for the port, kill it before finishing. Never block on a foreground server.
- No screen: verify UI with Playwright (headless Chromium). Save screenshots to `docs/screenshots/<session>/` and embed them in the PR.
- One session = one branch (`g<N>-<slug>`) = one PR with the roadmap's handoff checklist copied in and ticked.
- End every session by appending to `docs/BUILD_LOG.md`: what shipped, test counts, digests, known gaps.

## Commands
- `npm test` — Vitest (unit, parity, conservation, determinism)
- `npm run test:e2e` — Playwright
- `npm run typecheck` / `npm run lint`
- `npm run catalog:export` / `npm run catalog:check`
- `npm run sim -- <balance|run|montecarlo> <design.json> [--site <id>] [--years N] [--seed N]`

## Layout
- `packages/catalog` — xlsx exporter, zod schema, validators, generated catalog and goldens
- `packages/engine` — balance mode, time mode, allocation, provenance
- `packages/cli` — headless runner
- `apps/web` — Vite + React + PixiJS + Zustand UI
- `tests/e2e` — Playwright specs
- `data/sites` — climate presets

## Conventions
- TypeScript strict. Named exports. Pure functions take state and return new state.
- Tests describe game situations in plain language ("no stove in January fires a hardship event").
- UI copy: sentence case, plain verbs, name things by what players understand ("Water storage", not "capacity resource").
