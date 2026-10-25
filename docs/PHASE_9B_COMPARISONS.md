# LL-30 and LL-31 controlled comparisons

Reproduce with `node --import tsx packages/cli/bots/phase9b.ts`. Experimental flags remain off by default. Recipe, lifecycle and risk rates are game balance assumptions.

## First-year policy comparison

Two adults, greenfield, remote-job tutorial policy, 365 days. Every variant buys the same Solar Dehydrator on day 120 and uses the same tutorial policy. Preservation variants process mixed garden produce above a seven-household-day reserve. The only other difference is the preservation/lifecycle gate. Standard seed 1 and Real seeds 1–3 at each site; no unlimited supply. The tutorial policy reacts to quest progress, so resulting action dates may differ.

| Site | Weather/seed | Variant | Survival short days | Min wellbeing | Cash end | Food kcal left | Preserved kcal made | Processing hours | Predator losses |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| front-range | standard/1 | baseline | 0 | 75.2 | 57798.01 | 30830 | 0 | 0.0 | 0 |
| front-range | standard/1 | preservation | 0 | 75.2 | 57798.01 | 30830 | 0 | 0.0 | 0 |
| front-range | standard/1 | lifecycle | 0 | 75.2 | 57115.17 | 25282 | 0 | 0.0 | 0 |
| front-range | standard/1 | both | 0 | 75.2 | 57115.17 | 25282 | 0 | 0.0 | 0 |
| front-range | real/1 | baseline | 0 | 75.2 | 57446.67 | 30970 | 0 | 0.0 | 0 |
| front-range | real/1 | preservation | 0 | 75.2 | 57446.67 | 30970 | 0 | 0.0 | 0 |
| front-range | real/1 | lifecycle | 0 | 75.2 | 56862.48 | 25357 | 0 | 0.0 | 0 |
| front-range | real/1 | both | 0 | 75.2 | 56862.48 | 25357 | 0 | 0.0 | 0 |
| front-range | real/2 | baseline | 0 | 75.2 | 57373.25 | 30914 | 0 | 0.0 | 0 |
| front-range | real/2 | preservation | 0 | 75.2 | 57373.25 | 30914 | 0 | 0.0 | 0 |
| front-range | real/2 | lifecycle | 0 | 75.2 | 56725.20 | 46778 | 0 | 0.0 | 0 |
| front-range | real/2 | both | 0 | 75.2 | 56725.20 | 46778 | 0 | 0.0 | 0 |
| front-range | real/3 | baseline | 0 | 75.2 | 56766.24 | 34318 | 0 | 0.0 | 0 |
| front-range | real/3 | preservation | 0 | 75.2 | 56766.24 | 34318 | 0 | 0.0 | 0 |
| front-range | real/3 | lifecycle | 0 | 75.2 | 56132.22 | 25322 | 0 | 0.0 | 0 |
| front-range | real/3 | both | 0 | 75.2 | 56132.22 | 25322 | 0 | 0.0 | 0 |
| laramie-wy | standard/1 | baseline | 0 | 75.2 | 57025.23 | 20137 | 0 | 0.0 | 0 |
| laramie-wy | standard/1 | preservation | 0 | 75.2 | 57025.23 | 20137 | 0 | 0.0 | 0 |
| laramie-wy | standard/1 | lifecycle | 0 | 75.2 | 56138.85 | 29131 | 0 | 0.0 | 0 |
| laramie-wy | standard/1 | both | 0 | 75.2 | 56138.85 | 29131 | 0 | 0.0 | 0 |
| laramie-wy | real/1 | baseline | 0 | 75.2 | 56789.64 | 20137 | 0 | 0.0 | 0 |
| laramie-wy | real/1 | preservation | 0 | 75.2 | 56789.64 | 20137 | 0 | 0.0 | 0 |
| laramie-wy | real/1 | lifecycle | 0 | 75.2 | 56027.05 | 29131 | 0 | 0.0 | 0 |
| laramie-wy | real/1 | both | 0 | 75.2 | 56027.05 | 29131 | 0 | 0.0 | 0 |
| laramie-wy | real/2 | baseline | 0 | 75.2 | 56856.62 | 33789 | 0 | 0.0 | 0 |
| laramie-wy | real/2 | preservation | 0 | 75.2 | 56856.62 | 33789 | 0 | 0.0 | 0 |
| laramie-wy | real/2 | lifecycle | 0 | 75.2 | 56042.63 | 39666 | 0 | 0.0 | 0 |
| laramie-wy | real/2 | both | 0 | 75.2 | 56042.63 | 39666 | 0 | 0.0 | 0 |
| laramie-wy | real/3 | baseline | 0 | 75.2 | 55889.96 | 20137 | 0 | 0.0 | 0 |
| laramie-wy | real/3 | preservation | 0 | 75.2 | 55889.96 | 20137 | 0 | 0.0 | 0 |
| laramie-wy | real/3 | lifecycle | 0 | 75.2 | 55022.86 | 29131 | 0 | 0.0 | 0 |
| laramie-wy | real/3 | both | 0 | 75.2 | 55022.86 | 29131 | 0 | 0.0 | 0 |
| asheville-nc | standard/1 | baseline | 0 | 75.2 | 59690.64 | 34799 | 0 | 0.0 | 0 |
| asheville-nc | standard/1 | preservation | 0 | 75.2 | 59690.64 | 34799 | 0 | 0.0 | 0 |
| asheville-nc | standard/1 | lifecycle | 0 | 75.2 | 58652.34 | 25904 | 0 | 0.0 | 0 |
| asheville-nc | standard/1 | both | 0 | 75.2 | 58652.34 | 25904 | 0 | 0.0 | 0 |
| asheville-nc | real/1 | baseline | 0 | 75.2 | 59765.75 | 34799 | 0 | 0.0 | 0 |
| asheville-nc | real/1 | preservation | 0 | 75.2 | 59765.75 | 34799 | 0 | 0.0 | 0 |
| asheville-nc | real/1 | lifecycle | 0 | 75.2 | 58584.56 | 25904 | 0 | 0.0 | 0 |
| asheville-nc | real/1 | both | 0 | 75.2 | 58584.56 | 25904 | 0 | 0.0 | 0 |
| asheville-nc | real/2 | baseline | 0 | 75.2 | 59731.35 | 25310 | 0 | 0.0 | 0 |
| asheville-nc | real/2 | preservation | 0 | 75.2 | 59731.35 | 25310 | 0 | 0.0 | 0 |
| asheville-nc | real/2 | lifecycle | 0 | 75.2 | 58511.02 | 18909 | 0 | 0.0 | 0 |
| asheville-nc | real/2 | both | 0 | 75.2 | 58511.02 | 18909 | 0 | 0.0 | 0 |
| asheville-nc | real/3 | baseline | 0 | 75.2 | 59695.32 | 34799 | 0 | 0.0 | 0 |
| asheville-nc | real/3 | preservation | 0 | 75.2 | 59695.32 | 34799 | 0 | 0.0 | 0 |
| asheville-nc | real/3 | lifecycle | 0 | 75.2 | 58555.73 | 25904 | 0 | 0.0 | 0 |
| asheville-nc | real/3 | both | 0 | 75.2 | 58555.73 | 25904 | 0 | 0.0 | 0 |

## A harvest carried into winter

Matched existing solar dryer, one adult, 500 lb harvested meat (450,000 kcal), no prepared food, 120 days starting day 240; average climate, wellbeing penalties off to isolate food accounting. Both variants have preservation enabled and identical storage. One holds food fresh; the other processes surplus with no fresh reserve. Ordinary labor, sunlight, spoilage and storage limits apply. This is an isolated food-stock experiment, not an all-needs survival claim.

| Site | Policy | Days food below 60% | Food kcal left | Fresh spoiled kcal | Preserved kcal made | Processing hours |
|---|---|---:|---:|---:|---:|---:|
| front-range | Hold fresh | 3 | 0 | 216201 | 0 | 0.0 |
| front-range | Dry surplus | 0 | 62480 | 122408 | 221033 | 73.7 |
| laramie-wy | Hold fresh | 3 | 0 | 216201 | 0 | 0.0 |
| laramie-wy | Dry surplus | 0 | 62480 | 122408 | 221033 | 73.7 |
| asheville-nc | Hold fresh | 3 | 0 | 216201 | 0 | 0.0 |
| asheville-nc | Dry surplus | 0 | 62480 | 122408 | 221033 | 73.7 |

## Chick growth and predator protection

Growth: one twelve-chick batch for 60 days, ordinary labor, stocks and a prefilled 5,000-gallon cistern; matched supplied/absent chicken feed, predator events disabled to isolate growth. Protection: seed 3, one hen and the same guardian, four days; guardian near vs beyond 100 ft. The protection-only fixture uses validation supply to isolate the defense rule from feeding. No meat is obtained from predator losses.

| Site | Check | Result |
|---|---|---|
| front-range | Chicks without feed | 0 mature hens; 0.0 growth days |
| front-range | Chicks fed | 12 mature hens; complete growth days |
| front-range | Guardian out of range | 0 hen remaining; 0 attacks prevented |
| front-range | Guardian nearby | 1 hen remaining; 1 attacks prevented |
| laramie-wy | Chicks without feed | 0 mature hens; 0.0 growth days |
| laramie-wy | Chicks fed | 12 mature hens; complete growth days |
| laramie-wy | Guardian out of range | 0 hen remaining; 0 attacks prevented |
| laramie-wy | Guardian nearby | 1 hen remaining; 1 attacks prevented |
| asheville-nc | Chicks without feed | 0 mature hens; 0.0 growth days |
| asheville-nc | Chicks fed | 12 mature hens; complete growth days |
| asheville-nc | Guardian out of range | 0 hen remaining; 0 attacks prevented |
| asheville-nc | Guardian nearby | 1 hen remaining; 1 attacks prevented |

## Breeding and culling timing

One adult rabbit trio, one adult human, validation supply and predators disabled to isolate the lifecycle. Breeding books the $15 service once; birth needs 31 fed days and two work hours. Culling consumes two work hours, removes the cohort, and produces 12 lb once. No steady meat is produced under the lifecycle gate.

| Operation | Day | Rabbit cohorts | Meat produced (lb) | Cash spent |
|---|---:|---:|---:|---:|
| breed | 30 | 1 | 0 | 15.00 |
| breed | 31 | 2 | 0 | 15.00 |
| cull | 1 | 0 | 12 | 0.00 |
