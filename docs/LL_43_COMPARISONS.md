# LL-43 livestock lifecycle comparisons

Reproduce with `node --import tsx packages/cli/bots/husbandry.ts`. Controlled equipment checks, not survival-route claims: household food, water and cash supplied, wellbeing drift disabled, `livestockLifecycle` on for hatching and predators. No defaults change.

## One clutch from six hens

Six mature one-hen cohorts, Standard seed 1, clutch set on June 1 (day 151), predators off for this table, 30 days. "Eggs not laid" compares the flock’s laying with the same flock without a nest box. The breeding service is the existing LL-31 option booked on one hen (outside fertile stock, $5 per hen, one chick per hen).

| Site | Method | Eggs set | Chicks hatched | kWh | Eggs not laid (hen sitting) | Cash spent ($) |
|---|---|---:|---:|---:|---:|---:|
| front-range | incubator | 24 | 16 | 10.5 | 0.0 | 0 |
| front-range | broody hen | 8 | 6 | 0.0 | 10.8 | 0 |
| front-range | breeding service | 0 | 1 | 0.0 | 0.0 | 5 |
| laramie-wy | incubator | 24 | 16 | 10.5 | 0.0 | 0 |
| laramie-wy | broody hen | 8 | 6 | 0.0 | 11.1 | 0 |
| laramie-wy | breeding service | 0 | 1 | 0.0 | 0.0 | 5 |
| asheville-nc | incubator | 24 | 16 | 10.5 | 0.0 | 0 |
| asheville-nc | broody hen | 8 | 6 | 0.0 | 10.2 | 0 |
| asheville-nc | breeding service | 0 | 1 | 0.0 | 0.0 | 5 |

## Predator losses over a year

Six mature one-hen cohorts at one spot, no guardian, January 1–December 31, Standard weather, seeds 1–3. The run sits 10 ft away and holds 12 birds, so it covers all six. Protected hens survive to be warned again, so warnings rise with the run.

| Site | Seed | Protection | Warnings | Birds lost | Losses prevented | Run upkeep (h) |
|---|---:|---|---:|---:|---:|---:|
| front-range | 1 | none | 6 | 6 | 0 | 0.00 |
| front-range | 1 | run | 16 | 0 | 16 | 13.04 |
| front-range | 2 | none | 6 | 6 | 0 | 0.00 |
| front-range | 2 | run | 19 | 0 | 17 | 13.04 |
| front-range | 3 | none | 5 | 5 | 0 | 0.00 |
| front-range | 3 | run | 24 | 0 | 21 | 13.04 |
| laramie-wy | 1 | none | 6 | 6 | 0 | 0.00 |
| laramie-wy | 1 | run | 16 | 0 | 16 | 13.04 |
| laramie-wy | 2 | none | 6 | 6 | 0 | 0.00 |
| laramie-wy | 2 | run | 19 | 0 | 17 | 13.04 |
| laramie-wy | 3 | none | 5 | 5 | 0 | 0.00 |
| laramie-wy | 3 | run | 24 | 0 | 21 | 13.04 |
| asheville-nc | 1 | none | 6 | 6 | 0 | 0.00 |
| asheville-nc | 1 | run | 16 | 0 | 16 | 13.04 |
| asheville-nc | 2 | none | 6 | 6 | 0 | 0.00 |
| asheville-nc | 2 | run | 19 | 0 | 17 | 13.04 |
| asheville-nc | 3 | none | 5 | 5 | 0 | 0.00 |
| asheville-nc | 3 | run | 24 | 0 | 21 | 13.04 |

## Rotational paddocks on a 1-acre pasture

One adult and a 1-acre pasture on a 2-acre parcel, January 1–December 31, Standard seed 1. The kit sits on the pasture and is moved weekly when labor allows. The existing pasture row makes a steady weekly output that site and real-year weather do not change (unchanged by this ticket), so each site gives the same pair; the kit applies to Hay and Green biomass only.

| Site | Kit | Hay (lb) | Green biomass (lb) | Kit labor (h) |
|---|---|---:|---:|---:|
| front-range | no | 1564.3 | 1042.9 | 0.00 |
| front-range | yes | 1798.3 | 1198.9 | 52.14 |
| laramie-wy | no | 1564.3 | 1042.9 | 0.00 |
| laramie-wy | yes | 1798.3 | 1198.9 | 52.14 |
| asheville-nc | no | 1564.3 | 1042.9 | 0.00 |
| asheville-nc | yes | 1798.3 | 1198.9 | 52.14 |

Limits: fertile eggs are assumed whenever a mature hen cohort is present (no rooster or fertility rate); hatch rates, incubator power, broodiness daylight, run capacity and the paddock bonus are experimental balance. Sources and scope are in `LL_43.md`.
