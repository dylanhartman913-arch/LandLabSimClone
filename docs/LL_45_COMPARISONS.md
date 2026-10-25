# LL-45 heat, hot water and shelter efficiency comparisons

Reproduce with `node --import tsx packages/cli/bots/heat-efficiency.ts`. Controlled equipment checks, not survival-route claims: household food, water, firewood and cash supplied, wellbeing drift disabled, Standard weather, seed 1. No defaults change.

## Winter liner on the starter tent

One adult in the greenfield starter tent with its tiny wood stove and wool bedding, December 1 to February 28 (90 days). Heat need is the tent’s requested heat after bedding (and the liner).

| Site | Liner | Tent heat need (MBTU) | Heat met | Stove wood (lb) |
|---|---|---:|---:|---:|
| front-range | no | 4.18 | 98.9% | 643 |
| front-range | yes | 3.13 | 98.9% | 643 |
| laramie-wy | no | 5.37 | 80.5% | 643 |
| laramie-wy | yes | 4.03 | 98.9% | 643 |
| asheville-nc | no | 2.93 | 98.9% | 643 |
| asheville-nc | yes | 2.20 | 98.9% | 643 |

The tiny stove burns its catalog wood whether or not the tent needs all its heat (the stove also cooks), so the liner shows up as more of the need met, not as wood saved. With the bedding in place the remaining need is already small.

## Draft-proofing a tiny house

One adult in a tiny house on wheels, January 1–December 31, no heater or cooler, so the table shows the need itself.

| Site | Draft-proofed | Heat need (MBTU/yr) | Cooling need (MBTU/yr) |
|---|---|---:|---:|
| front-range | no | 9.02 | 1.20 |
| front-range | yes | 7.67 | 1.08 |
| laramie-wy | no | 13.75 | 0.15 |
| laramie-wy | yes | 11.69 | 0.14 |
| asheville-nc | no | 5.66 | 1.35 |
| asheville-nc | yes | 4.81 | 1.22 |

## Hot water for one adult

One adult (40 gal hot water/week) in a tiny house, January 1–December 31. Hot water met is delivered ÷ requested from the daily ledgers; heat made is the boiler’s output in the heating season.

| Site | Water heater | Hot water met | Wood (lb/yr) | Propane (gal/yr) | Boiler heat made (MBTU/yr) |
|---|---|---:|---:|---:|---:|
| front-range | none | 0.0% | 0 | 0.0 | — |
| front-range | Wood Boiler with Water Jacket | 99.7% | 2607 | 0.0 | 7.82 |
| front-range | Propane Tankless Water Heater | 99.7% | 0 | 31.3 | — |
| front-range | Solar Hot Water Heater | 99.7% | 0 | 0.0 | — |
| laramie-wy | none | 0.0% | 0 | 0.0 | — |
| laramie-wy | Wood Boiler with Water Jacket | 99.7% | 2607 | 0.0 | 7.82 |
| laramie-wy | Propane Tankless Water Heater | 99.7% | 0 | 31.3 | — |
| laramie-wy | Solar Hot Water Heater | 99.7% | 0 | 0.0 | — |
| asheville-nc | none | 0.0% | 0 | 0.0 | — |
| asheville-nc | Wood Boiler with Water Jacket | 99.7% | 2607 | 0.0 | 7.82 |
| asheville-nc | Propane Tankless Water Heater | 99.7% | 0 | 31.3 | — |
| asheville-nc | Solar Hot Water Heater | 99.7% | 0 | 0.0 | — |

Limits: the liner and draft-proofing are fixed heat-need multipliers, with no condensation, ventilation or wear beyond LL-28; the boiler’s summer heat is simply unused; hot water stays a comfort need outside the coverage score. Values are experimental balance; scope is in `LL_45.md`.
