# TERRA Homestead Plugin

A top-down homestead planning simulator. Place systems (shelters, panels, gardens, animals) on a parcel; each system draws inputs and makes outputs; the Human Needs Checklist scores how much of a household's life the design covers. The engine is deterministic, unit-consistent, and explains every number it shows.

- **Play:** [`docs/PLAYING.md`](docs/PLAYING.md). The game deploys to GitHub Pages from `main` (`.github/workflows/pages.yml`).
- **Mod:** [`docs/MODDING.md`](docs/MODDING.md): add a system in the spreadsheet, run one command, and it's in the game.
- Catalog source of truth: `data/source/LandLab_Sim_Systems_v2.xlsx` ([`docs/CATALOG.md`](docs/CATALOG.md))
- Engine: [`docs/ENGINE.md`](docs/ENGINE.md)
- Roadmap: `docs/HOMESTEAD_SIM_ROADMAP.md`
- Build log (what's done, what isn't, and where to pick up): [`docs/BUILD_LOG.md`](docs/BUILD_LOG.md)
- Conventions: `CLAUDE.md`

## Quick start

```sh
npm ci
npm test            # unit, parity, conservation, determinism
npm run dev         # http://localhost:5173
npm run build && npm run test:e2e    # Playwright against vite preview
npm run sim -- montecarlo designs/rain-fed-yurt.json --years 10 --seeds 200
```

The command-line simulator (`npm run sim -- balance|run|montecarlo <design.json>`) runs the same engine as the game; Monte Carlo results match the game's Weather risk panel to the digit for the same design, site, and seeds.

## Layout

| Path | What |
|---|---|
| `packages/catalog` | xlsx exporter, zod schema, generated catalog and goldens |
| `packages/engine` | pure TypeScript simulation (balance mode, time mode, provenance) |
| `packages/cli` | headless runner (`npm run sim -- ...`) |
| `apps/web` | Vite + React + PixiJS + Zustand game UI |
| `tests/e2e` | Playwright specs |
| `data/sites` | climate presets |
