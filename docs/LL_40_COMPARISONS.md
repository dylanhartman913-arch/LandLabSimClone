# LL-40 controlled water comparisons

Reproduce with `node --import tsx packages/cli/bots/water-food-expansion.ts`. Standard weather, seed 1. These fixtures isolate equipment; ample food/cash and zero wellbeing drift are test controls, not survival-route claims. Storage pools enabled. All rates are game abstractions; see LL_40.md.

## Safe-water storage

Start with 200 gal drinking water and no raw water. One day, no treatment system.

| Site | Tank | Drinking water spilled (gal) | Drinking water left (gal) |
|---|---|---:|---:|
| front-range | household containers | 149.3 | 50.0 |
| front-range | 100 gal potable | 49.3 | 150.0 |
| laramie-wy | household containers | 149.3 | 50.0 |
| laramie-wy | 100 gal potable | 49.3 | 150.0 |
| asheville-nc | household containers | 149.3 | 50.0 |
| asheville-nc | 100 gal potable | 49.3 | 150.0 |

## Spring connection

Seven days; one box moved to a spring node, compared with no box. No auto-fetching; output is untreated water. Missing springs are left missing.

| Site | Box | Piped raw water (gal) | Box upkeep (h) |
|---|---|---:|---:|
| front-range | none | 0.0 | 0.00 |
| front-range | connected | 175.0 | 0.25 |
| laramie-wy | none | 0.0 | 0.00 |
| laramie-wy | connected | 175.0 | 0.25 |
| asheville-nc | none | 0.0 | 0.00 |
| asheville-nc | no site spring | 0.0 | 0.25 |

## Winter heat trace

January 1–April 30, 120 days. Same 100-gal tank with/without wind turbine and battery; starts with 80 gal raw water. Heating uses spare electricity.

| Site | Power | Frozen tank-days | Heater kWh |
|---|---|---:|---:|
| front-range | none | 25 | 0.0 |
| front-range | wind + battery | 0 | 3.0 |
| laramie-wy | none | 98 | 0.0 |
| laramie-wy | wind + battery | 0 | 50.4 |
| asheville-nc | none | 0 | 0.0 |
| asheville-nc | wind + battery | 0 | 0.0 |

## First flush

Seven days, one rain barrel, filter and 40 gal raw water. Diverter readiness uses previous-day measured upkeep.

| Site | Diverter | Captured raw water (gal) | Filter labor (h) |
|---|---|---:|---:|
| front-range | none | 4.54 | 0.071 |
| front-range | working | 4.35 | 0.063 |
| laramie-wy | none | 3.95 | 0.036 |
| laramie-wy | working | 3.78 | 0.036 |
| asheville-nc | none | 41.75 | 0.107 |
| asheville-nc | working | 39.97 | 0.089 |
