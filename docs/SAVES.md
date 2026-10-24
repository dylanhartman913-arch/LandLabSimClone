# Saves, replay and migrations

A save (`homestead.save.v1`, `packages/engine/src/replay.ts`) holds:

- the game's `init` (site, seed, settings, start);
- its full action log;
- a snapshot of the state;
- the snapshot's digest.

Loading replays the log from `init` and compares digests. A match means the save is verified and the replayed state is used. A mismatch means the snapshot is used and the player is told why.

## What a save preserves

| Part of the story | How it survives |
|---|---|
| Systems, construction progress, materials drawn | Replayed actions (`place`, `hireConstruction`, …) and daily steps |
| Work priorities, caps, auto-gather, emergency construction | `settings` actions |
| One-off and standing market orders | `buy` and `standing` actions; pending orders deliver on the next trip, exactly once (`replay.test.ts`, LL-11) |
| Residents in town, wellbeing, return rules | Daily steps under the game's settings |
| Tutorial line and progress | Chosen at start (`tutorialSeasons`), advanced by daily steps |
| Report history | Not stored: rebuilt from the game's own ledgers (730 days kept) on load (`rebuildReports`, LL-11) |
| Alerts and the 90-day forecast | Derived views, recomputed from the loaded state |
| Interface preferences (units, auto-pause, last build mode) | Browser-local, intentionally not in saves |

## Changing persisted mechanics: the migration rule

Any change that alters what an existing action log replays to must keep old saves verifiable:

1. **Gate it with a settings flag.** For example: `safeRecovery`, `reuseIdleLabor`, `survivalShelterReturn`, `safeWaterFirst`. Absent means the old behavior, so legacy logs replay to their recorded digests.
2. **Start-only changes are read at start.** For example: `serviceWarmUp`, `tutorialSeasons`. `startGame` passes the flag to `gameFromStart`, and a saved game keeps whatever it started with.
3. **New games opt in.** `NewGame` and the default game set every flag.
4. **Continued games opt in once.** `loadGame` appends one `settings` action, with all missing flags, on the continuation day, after the original replay has verified. The load message explains each upgrade. Read-only loads never migrate.
5. **Bump `ENGINE_VERSION`.** Note the flag and the change in `docs/BUILD_LOG.md`.
6. **Prove it.** Add a test showing the legacy behavior without the flag, the new behavior with it, and unchanged fixture digests (`accounting.test.ts` keeps the playtest saves' digests).

Display-only changes (views, alerts, previews, reports) don't need a flag, because they never alter a replay. Catalog edits do change replays. They go through the xlsx and `catalog:export`, and a save made against an older catalog loads from its snapshot with a message.
