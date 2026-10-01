# Digest history

`digests.json` holds the committed fingerprints that the balance and time tests compare against. This note records every re-recording since G11 and what caused it, because the re-recordings were committed inside feature commits rather than on their own. No value here was changed by this note.

- **Balance digests** (`balance:*`) target `balancePotential` (the spreadsheet). They have not changed since G10.
- **Time digests** (`time:*`) come from a one-year run of each design with seed 42 (`time-invariants.test.ts`, "determinism").

## Time digests by commit

| Commit | Cause | `time:starter.json` | `time:offgrid-cabin-family.json` | `time:suburban-baseline.json` |
|---|---|---|---|---|
| `1a2d13e` (G10, before G11) | — | `d3c7db5705dadb12` | `b80456dd705d9f94` | `84e47ac086416c3f` |
| `2ec5579` (G11–G12) | heat and cooling delivery, the time-mode output-multiplier fix, auto-layout, new ledger fields; backstop dispatch and self-reliance fields | `309bb8cddb82c284` | `bf86f2da84eadc97` | `e664d8d60ecc68ad` |
| `4e06287` (G14) | labor refactor: floating-point reordering (3.7e-14 gal) | `8453ea4c12fb8415` | `d40f3374eaa0a7b6` | unchanged |
| `ac41a6e` (G15) | wellbeing v2 replaces health; labor follows it (0.5–1) | `b68f73296d744388` | `bb1a900eb08f3884` | `06a4d2d355f6ba34` |
| `55622ac` (G16) | the engine fixes below | `597405555e09f6e0` | `8e5b69da0f8d529c` | `4d8464032212228c` |

## G16 engine fixes, one at a time

Measured at `55622ac` by reverting one fix alone and regenerating with `UPDATE_DIGESTS=1` (audit, `docs/AUDIT_G11_G16.md`):

| Fix | Digests it changed (old → new) |
|---|---|
| Upkeep is job priority 1, not 3 (`time/gather.ts`) | `time:suburban-baseline.json` `06a4d2d355f6ba34` → `4d8464032212228c` |
| Flow boosts draw on stock (`time/step.ts`, `allocate` and `consume`) | `time:starter.json` `b68f73296d744388` → `597405555e09f6e0`; `time:offgrid-cabin-family.json` `bb1a900eb08f3884` → `8e5b69da0f8d529c` |
| Seed kept from meals (`seedReserve`) | none |
| Weekly bills include running costs (`DaySpend.running`) | none |

Reverting the upkeep and boost fixes together gives back all three G15 values exactly, so nothing else in `55622ac` moved a time digest.
