# LL-42 feed and fodder comparisons

Reproduce with `node --import tsx packages/cli/bots/fodder.ts`. Controlled equipment checks, not survival-route claims: food/cash/water stocks supplied, wellbeing drift disabled. New systems use ordinary finite inputs and labor. No defaults change.

## Full-year hay cutting

One adult, one 0.1-acre meadow, one barn (both variants), January 1–December 31. Scythe labor is shown separately so its upkeep is not hidden. Fully staffed yield is the same; cutting time falls. Standard seed 1 and Real seeds 1–3, all sites.

| Site | Weather/seed | Scythe | Hay produced (lb) | Meadow labor (h) | Cutting hours saved | Scythe upkeep (h) |
|---|---|---|---:|---:|---:|---:|
| front-range | Standard/1 | no | 208.57 | 15.64 | 0.00 | 0.00 |
| front-range | Standard/1 | yes | 208.57 | 9.56 | 6.08 | 5.21 |
| front-range | Real/1 | no | 208.57 | 15.64 | 0.00 | 0.00 |
| front-range | Real/1 | yes | 208.57 | 9.56 | 6.08 | 5.21 |
| front-range | Real/2 | no | 149.46 | 12.69 | 0.00 | 0.00 |
| front-range | Real/2 | yes | 149.46 | 8.33 | 4.36 | 5.21 |
| front-range | Real/3 | no | 180.40 | 14.23 | 0.00 | 0.00 |
| front-range | Real/3 | yes | 180.40 | 8.97 | 5.26 | 5.21 |
| laramie-wy | Standard/1 | no | 152.95 | 12.86 | 0.00 | 0.00 |
| laramie-wy | Standard/1 | yes | 152.95 | 8.40 | 4.46 | 5.21 |
| laramie-wy | Real/1 | no | 152.95 | 12.86 | 0.00 | 0.00 |
| laramie-wy | Real/1 | yes | 152.95 | 8.40 | 4.46 | 5.21 |
| laramie-wy | Real/2 | no | 95.68 | 10.00 | 0.00 | 0.00 |
| laramie-wy | Real/2 | yes | 95.68 | 7.21 | 2.79 | 5.21 |
| laramie-wy | Real/3 | no | 132.29 | 11.83 | 0.00 | 0.00 |
| laramie-wy | Real/3 | yes | 132.29 | 7.97 | 3.86 | 5.21 |
| asheville-nc | Standard/1 | no | 208.57 | 15.64 | 0.00 | 0.00 |
| asheville-nc | Standard/1 | yes | 208.57 | 9.56 | 6.08 | 5.21 |
| asheville-nc | Real/1 | no | 208.57 | 15.64 | 0.00 | 0.00 |
| asheville-nc | Real/1 | yes | 208.57 | 9.56 | 6.08 | 5.21 |
| asheville-nc | Real/2 | no | 164.37 | 13.43 | 0.00 | 0.00 |
| asheville-nc | Real/2 | yes | 164.37 | 8.64 | 4.79 | 5.21 |
| asheville-nc | Real/3 | no | 192.41 | 14.83 | 0.00 | 0.00 |
| asheville-nc | Real/3 | yes | 192.41 | 9.22 | 5.61 | 5.21 |

## Finite feed batches

One adult, seven days, no birds. Each variant starts with 21 lb grain, 4 lb greens and 2 lb grubs, except the named missing input. Barn and root cellar in all variants. Grain may also be eaten by the person; processing is separate from meals.

| Variant | Grain processed (lb) | Greens processed (lb) | Grubs processed (lb) | Feed made (lb) | Processing loss (lb) | Mix labor (h) |
|---|---:|---:|---:|---:|---:|---:|
| all ingredients | 7.00 | 2.00 | 1.00 | 9.00 | 1.00 | 1.00 |
| no Grain | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| no Green biomass | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| no Grubs | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## Shared storage and delivery

Orders for 1,900 lb hay and 400 lb feed, applied in that order, one day, $10,000 cash. Barn contributes 200 cu ft; bins contribute 10. Hay uses 9.5 lb/cu ft, feed 40 lb/cu ft. The two resources share capacity; barn space cannot store tools.

| Storage | Hay delivered (lb) | Feed delivered (lb) | Hay left to order (lb) | Feed left to order (lb) |
|---|---:|---:|---:|---:|
| bins only | 95.0 | 0.0 | 1805.0 | 400.0 |
| barn + bins | 1900.0 | 400.0 | 0.0 | 0.0 |

Limits: seasonal smoothing rather than individual mowing/drying dates, moisture and nutrition abstracted, conservative scythe reservation before node gathering. Rain response and all costs/labor/mix ratios are experimental balance; source references and scope are in `LL_42.md`.
