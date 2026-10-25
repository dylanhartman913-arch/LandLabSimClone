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

## Phase 9 finance (LL-37, engine 0.17.0)

`finance` remains explicitly opt-in; startup and continuation migrations do not enable it. Logged `finance` actions borrow, repay, choose insurance or set reserve days. Optional `GameState.finance` holds debt, unpaid tax, policy choice and reserve days, and participates in the digest. A settings action enabling Finance initializes the account and converts any legacy negative cash to labeled opening debt. Turning the gate off pauses assessments without forgiving liabilities.

Between-day draws and repayments use optional `pendingCash.borrowed`/`repaid`, included in the digest while pending, then reset with the next day. Optional cash-ledger `borrowed`/`repaid` fields retain their classification even if the gate was disabled before stepping. Optional daily `finance` records track assessed interest, capitalized interest, assessed/paid tax, premiums, coverage, claims and closing liabilities. Cash inflows/outflows include financing for conservation; runway and the net-positive-season milestone exclude principal transfers and insurance payouts. Reports identify them explicitly. Finance rules are validated overrides; the workbook and its source hash are unchanged. Legacy digest fixtures remain unchanged.

## Phase 9 warned risk events (LL-38, engine 0.18.0)

`riskEvents` remains explicitly opt-in. Optional `risks` holds threats (`id`, kind, warned/start/end absolute days and optional target instance) and previous-day measured defense readiness. Optional `riskRng` supplies a fixed two draws per kind every configured interval, independently of eligibility or mitigation; it never advances the weather, predator or household streams. Both optional fields participate in digests and JSON continuation. Daily ledgers gain an optional active-risk list; `risk` events record warnings, starts, ends and averted equipment failures. The existing LL-31 predator state/stream stays authoritative.

A logged settings action disabling the gate clears threats and readiness, freezes the risk stream and stops transient effects; equipment condition and already-realized losses remain. Re-enabling schedules future risks from the saved stream. Finance sees the original positive condition before a warned breakdown sets it to zero, so existing equipment insurance can record exactly one covered failure. No automatic migration, save-schema change or workbook/source-hash change is introduced. Legacy digests remain unchanged.

## Phase 9 transportation access (LL-39, engine 0.19.0)

`transportAccess` remains explicitly opt-in. No new action kinds: existing logged settings, orders, work, trades and town transitions determine trips. Optional daily `access` records hold trip purpose/key, optional system, attempted and own miles, paid/deferred fare, completion/reason, old-fare repayment and closing fare due. Optional `GameState.access.fareDue` stores unpaid emergency town fares and participates in the digest; ordinary commuting and deliveries cannot defer fares. Paid non-market fares and settlement use optional `spend.access`; market alternatives retain `spend.delivery`. End-of-day return-trip cash is reflected in the same day's ledger.

With the gate on, recurring catalog Transportation inputs are replaced by actual trips, residents lose no travel wellbeing, and the checklist access row is outside household coverage/self-reliance averages. Mixed measured windows using access ignore legacy flat travel demand on days without trip records. Workbook flows, source hash and raw parity stay unchanged. Disabling pauses settlement of saved fare liabilities and restores legacy inputs; re-enabling resumes. Startup/continuation never enables the experiment automatically. Legacy digest fixtures remain unchanged; replay/JSON continuation cover a real zero-cash departure and its still-payable fare.

## LL-40/41 catalog expansion (0.20.0)

No new action or automatic setting migration. New system IDs S179–S189 are workbook-backed and use existing placement, movement, removal, settings and `preserve` actions. First-flush and potable/freeze behavior reuse `storagePools`; processing and rodent protection reuse `foodPreservation`; testing warnings reuse `riskEvents`. Existing settings remain off by default.

`DayLedger.waterTests?` records `{ instanceId, warning }` only after a fully supplied active kit operates under the risk gate. Records persist through ordinary ledger serialization. A kit warning is precautionary, not a laboratory pass/fail result. Spring boxes use existing `nodeStock`; multiple boxes share a day-local site-flow budget. Heat-traced tanks acquire the existing `winter` structure with built-in installed heating on their first storage-pool day. Their protection cannot be removed by a retrofit action.

Cheese uses canonical pounds and the existing `processed`/`converted` ledger fields. Here `converted` is in the resource's own unit (kcal for Preserved food; pounds for Cheese), and reporting applies the resource's kcal factor. Fresh inputs transformed into cheese or seed are not household meals. Unused Cheese is omitted from legacy game initialization; unused new resources do not alter the compact legacy numeric balance digest. New catalog source hashes change normally with the workbook. Older records without these optional fields continue to load; new records require the expanded catalog for their new system IDs.

## LL-42 feed and fodder (0.21.0)

Workbook system IDs S190–S192 use existing placement, settings, purchase, movement and removal actions. No new action or setting migration. Meadow production is seasonal, with rainfall and actual labor constraints; scythe assistance uses `toolGathering`. Dedicated `Feed storage` is a capacity in cu ft and joins the existing LL-33 pool only when `storagePools` is enabled. The feed mix works whenever placed and supplied.

Optional `DayLedger.fodder` entries contain `{ instanceId, scytheIds, cuttingHours, toolHours, savedHours }` for seasonal meadow cutting after operating satisfaction. All hours are realized daily values. Tool reservations are derived each day, not carried as a new saved bank. Meadow records, stock, condition and settings reproduce through JSON continuation; older states simply omit the optional records. Feed-mix inputs use `ResourceDay.processed` in canonical pounds and do not become household meals. No new flow stock is introduced. The compact legacy balance serializer omits unused Feed storage, preserving prior numeric digest assertions while the source workbook hash changes normally.


## LL-43 livestock lifecycle infrastructure (0.22.0)

Workbook system IDs S193–S196 use existing placement, movement and removal actions. One new logged action, `{ kind: 'hatch', id, operation: 'set' | 'cancel' }`, sets or cancels a clutch on an incubator or nest box; it requires `livestockLifecycle`, a mature hen cohort and, for a nest box, a free hen within range and at least 13 h of daylight. No setting migration; every existing gate stays off by default.

Optional `Instance.hatch` is `{ eggs, days, missed, henId? }`: `eggs` is 0 while the clutch waits for a full set of eggs in stock (those eggs are held back from meals like a planting reserve), then the number set; `days` and `missed` count incubation days. Optional `DayLedger.hatching` entries hold `{ instanceId, eggsSet, counted, kWh, hatched }`. Eggs set use `ResourceDay.processed`; incubator power uses `consumed`. Hatched chicks are an ordinary LL-31 Baby Chicks cohort placed like a birth. New livestock event kinds `eggs-set` and `hatch-failed` join the existing livestock events.

The predator-proof run and paddock kit add no saved state: run coverage and the paddock multiplier are derived from the layout and the previous day's satisfaction. A kit is its own solo allocation group, and its pasture becomes a solo group while a kit sits on it. Older states omit every new field and replay unchanged; legacy digests are unchanged.

## LL-44 waste, soil and sanitation (0.23.0)

Workbook system IDs S197–S201 use existing placement, movement and removal actions; no new action or setting migration. The windrow, both carbon sources and the laundry station are ordinary workbook flows. Cover crop seeding works only under the existing `soilFertility` gate through the optional `soilFertility.seeding` rule.

The kit's Seeds flow (F0873) is a window flow (weeks 35–41) by override; its annual quantity keeps workbook parity. Optional `Instance.sown` (0–1) is the share of this year's seed received in that window; it resets on the window's first day and persists until the next. Off-season fertility gain from the kit is folded into the existing `DayLedger.fertility[].cover` field. Older states omit `sown` (treated as unsown) and replay unchanged; legacy digests are unchanged.

## LL-45 heat, hot water and shelter efficiency (0.24.0)

Workbook system IDs S202–S204 use existing placement, movement and removal actions; no new action, saved field or setting. The liner and draft-proofing kit are host modifiers in `catalog_overrides.json` (`systems.S202/S204.modifies`), derived from the layout each day like the weatherization retrofit. The boiler's wood flow (F0881) is steady by flow-timing override; its annual quantity keeps workbook parity. `ChecklistView.hotWater` is a view-only field computed from existing ledger `Hot water` requested/unmet. Legacy digests are unchanged.

## LL-46 income and trade (0.25.0)

Workbook system IDs S205–S206 and the `Woolen goods` resource (canonical lbs, sale reference price in overrides) use existing placement and trade actions. No new action kind: labor barter is an ordinary `sell` action with `resource: 'Labor'` and a required `receive`, stored in the existing `market.sales` queue (amount in hours). The CSA's three flows (F0885–F0887) are growing-season by flow-timing override; annual quantities keep workbook parity. The CSA runs only under the existing `sellingAndTrade` gate.

Optional `DayLedger.csa` entries hold `{ instanceIds, share, revenue, makeGood }` for growing-season days; optional `DaySpend.makeGood` is included in `spendTotal` and shown as a "CSA make-good" bill. Labor barter receipts are ordinary `trades` entries with `resource: 'Labor'` and `revenue: 0`; its hours appear under `laborBySystem['Neighbor work']`. Older states omit every new field and replay unchanged; legacy digests are unchanged.

## LL-51 sites, starts and households (0.26.0)

Three new site presets and two new starts are data; a game records its site and start as before. New optional fields, all absent from older states, which replay unchanged (legacy digests and the LL-50 headlines are unchanged):

- `Site.hazards` `{ riskChanceMult, text }`: scales LL-38 risk chances under `riskEvents`. The draw count is unchanged, so the risk stream stays aligned.
- `GameInit.start.children` and `GameState.start.children`: children placed as Human Beings with `person.role = 'child'`; a start with children sets `householdRoles: true` in its initial settings.
- `FinanceState.mortgage` `{ balance, annualRate, payment, arrears }` and `FinanceDay.mortgage` `{ interest, paid, balance, arrears }`. Mortgage payments are part of `cash.out`. The farm start's own `settings` (`finance`, `sellingAndTrade`, `transportAccess`) are part of its initial settings, so a replay of `GameInit` reproduces them.

No new action kind. A start's `settings` and `mortgage` are read only when a game is created from it.
