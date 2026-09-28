# TERRA Homestead Plugin

A top-down homestead planning simulator. Place systems (shelters, panels, gardens, animals) on a parcel; each system draws inputs and makes outputs; the Human Needs Checklist scores how much of a household's life the design covers. The engine is deterministic, unit-consistent, and explains every number it shows.

- Catalog source of truth: `data/source/LandLab_Sim_Systems_v2.xlsx`
- Roadmap: `docs/HOMESTEAD_SIM_ROADMAP.md`
- Build log: `docs/BUILD_LOG.md`
- Conventions: `CLAUDE.md`

## Quick start

```sh
npm ci
npm test            # unit, parity, conservation, determinism
npm run dev         # http://localhost:5173
npm run test:e2e    # Playwright against vite preview
```

## Layout

| Path | What |
|---|---|
| `packages/catalog` | xlsx exporter, zod schema, generated catalog and goldens |
| `packages/engine` | pure TypeScript simulation (balance mode, time mode, provenance) |
| `packages/cli` | headless runner (`npm run sim -- ...`) |
| `apps/web` | Vite + React + PixiJS + Zustand game UI |
| `tests/e2e` | Playwright specs |
| `data/sites` | climate presets |
