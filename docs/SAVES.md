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

## Phase 8 (0.9.0)

New games enable `employmentPriority` (employment below upkeep, 40 h/adult/week), `siteCrewRates` (new crew bookings at the site's rate), and `cashFloor` (no new overdraft). Continuation adds all missing runtime flags in the same single settings action as earlier upgrades; read-only loads keep their original settings. Existing booked contracts preserve their rate for refunds; a contract without a stored rate was booked at the legacy $35/h.

`householdStart` is start-only: new greenfield games begin with $8,000 per adult. Loading an older game does not add it or grant starting cash again. The old action log and original starting cash still replay exactly. No save-schema or catalog change is needed.

## Phase 9 (0.10.0): experimental opt-in

`wearAndRepair` and `sellingAndTrade` are exceptions to the default-on rollout above: both remain absent/off for new and continued games until a player enables them in Settings. Enabling/disabling is a logged settings action. No automatic migration adds them. Optional instance condition/service work, market sales and daily trade receipts round-trip in the existing save schema; `service` and `sell` actions replay them. Turning wear off retains condition while pausing its penalty and degradation.

The Farm Stand workbook row and sales reference prices change the catalog hash. Existing saves follow the existing catalog-mismatch snapshot path. The old playtest digest fixtures continue to pass without either mechanic enabled.

## Phase 9 (0.11.0): preservation and livestock

`foodPreservation` and `livestockLifecycle` follow the same explicit opt-in rule as LL-28/LL-29; neither startup nor continuation migration enables them. Policies use logged `preserve` and `livestock` actions. Optional instance processing rules, animal age/growth, partial breeding/culling work and predator countdowns round-trip in the existing schema. Offspring IDs use the game's existing monotonic instance counter.

The independent optional `livestockRng` is saved and fingerprinted when present. It pauses when lifecycle is disabled and never advances the main climate RNG. Regression coverage crosses a year boundary with predators enabled and proves the weather log matches the same run without lifecycle.

The appended Preserved food workbook row changes the catalog hash, so older-catalog saves follow the snapshot compatibility path. When preservation is absent/off and a game never had preserved stock, the engine does not add a zero stock/ledger key to that legacy state. The numeric balance projection likewise omits this unused experimental resource; the full catalog/parity result still contains it. Existing numeric balance, one-year and playtest save digest fixtures remain unchanged. Turning preservation off retains existing preserved stock and policies while stopping new conversion.

## Phase 9 shelter occupancy (LL-32, engine 0.12.0)

`shelterOccupancy` remains explicitly opt-in; startup and continuation migrations do not enable it. Logged `assignShelter` and `closeShelter` actions set optional instance `shelterId` and `shelterClosed` fields. An absent assignment keeps the household in the first completed open shelter; null explicitly means no assigned shelter. Invalid explicit assignments remain unassigned after removal. People in town keep their assignment.

Optional `shelterThermal` maps preserve yesterday’s routed thermal output by home, and optional daily `shelters`/`residentShares` records preserve per-home receipts and least-served-resident eligibility. Replay digests include the receipt map only when present. Settings actions that toggle occupancy clear that map, giving the enabled routing one warm-up operating day. Disabling occupancy retains assignments and closure choices but restores legacy loads/allocation until re-enabled. Legacy digest fixtures pass without this setting; no catalog rows or hash change for LL-32.

## Phase 9 storage pools and winter water (LL-33, engine 0.13.0)

`storagePools` remains explicitly opt-in; startup and continuation migrations do not enable it. Logged `winterize` actions set the optional instance `winter` field (`protection`, `setupHours`, `frost`, and `frozen` gallons of locked ice) and charge cash at once. Daily ledgers gain an optional `winter` record per affected tank and an optional `frozen` term on the Water resource. A settings action that turns the gate off returns all locked ice to the Water stock and clears frost; protections are retained. The `winterStorage` rule comes from `data/catalog_overrides.json`; the workbook and its hash are unchanged. Legacy digest fixtures pass without this setting.

## Phase 9 tools multiply gathering (LL-34, engine 0.14.0)

`toolGathering` remains explicitly opt-in; startup and continuation migrations do not enable it, and it is toggled only by a logged settings action. No new instance or state fields: tool use is recorded on the existing daily `gathered` records as optional `toolIds`, `toolHours`, `toolExtra` and `fuel`, and gasoline burned is in the Gasoline ledger's `consumed`. The `toolRules` come from `data/catalog_overrides.json`; the workbook and its hash are unchanged. Legacy digest fixtures pass without this setting.

## Phase 9 soil fertility (LL-35, engine 0.15.0)

`soilFertility` remains explicitly opt-in; startup and continuation migrations do not enable it, and it is toggled only by a logged settings action. Gardens gain an optional instance `fertility` field, absent until the first gated day (absent means the rule's starting level). Daily ledgers gain optional `fertility` records per garden. Manure drawn for gardens is in the Manure ledger's `consumed`. The `soilFertility` rule comes from `data/catalog_overrides.json`; the workbook and its hash are unchanged. Turning the gate off keeps saved fertility but restores the legacy compost switch. Legacy digest fixtures pass without this setting.

## Phase 9 household roles, skills and health (LL-36, engine 0.16.0)

`householdRoles` remains explicitly opt-in; startup and continuation migrations do not enable it. Logged `role` actions set the optional person `role`; persons also gain optional `skills` (practice hours) and `condition` (ill or injured, days left). The optional `householdRng` stream is saved and fingerprinted when present; it advances only while the gate is on and never touches the climate or livestock streams. Daily ledgers gain an optional `household` record (practice hours and injury risk) and `person` events. The `householdRoles` rule comes from `data/catalog_overrides.json`; the workbook and its hash are unchanged. Turning the gate off keeps saved roles, skills and conditions but restores identical adults. Legacy digest fixtures pass without this setting.

