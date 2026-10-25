# LL-35 soil fertility comparisons

Reproduce with `node --import tsx packages/cli/bots/fertility.ts`. LL-35 remains an opt-in experimental setting; nothing here changes defaults. Rates are game balance (see `docs/LL_35.md`), not agronomic forecasts.

## First-year routes

Two adults, greenfield remote-job tutorial policy (which builds beds and a compost pile through the quests), 365 days. Settings otherwise match current game defaults; ordinary supplies. Standard seed 1 and Real seeds 1–3. Crops are vegetables, root crops and grain produced on the homestead (gathering excluded).

| Site | Weather/seed | Variant | Survival short days | Min wellbeing | End cash | Crops grown (lb) | Garden-days stopped by compost | Compost used (lb) | Manure used (lb) | Mean garden fertility at year end |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| front-range | standard/1 | legacy | 0 | 75.2 | 58050 | 203 | 0 | 213 | 0 | — |
| front-range | standard/1 | fertility | 0 | 75.2 | 57843 | 167 | 0 | 213 | 0 | 0.88 |
| front-range | real/1 | legacy | 0 | 75.2 | 57700 | 200 | 0 | 211 | 0 | — |
| front-range | real/1 | fertility | 0 | 75.2 | 57474 | 165 | 0 | 211 | 0 | 0.88 |
| front-range | real/2 | legacy | 0 | 75.2 | 57614 | 165 | 0 | 174 | 0 | — |
| front-range | real/2 | fertility | 0 | 75.2 | 57431 | 136 | 0 | 174 | 0 | 0.88 |
| front-range | real/3 | legacy | 0 | 75.2 | 57027 | 204 | 0 | 215 | 0 | — |
| front-range | real/3 | fertility | 0 | 75.2 | 56799 | 168 | 0 | 215 | 0 | 0.88 |
| laramie-wy | standard/1 | legacy | 0 | 75.2 | 57249 | 211 | 0 | 222 | 0 | — |
| laramie-wy | standard/1 | fertility | 0 | 75.2 | 57033 | 174 | 0 | 222 | 0 | 0.88 |
| laramie-wy | real/1 | legacy | 0 | 75.2 | 57014 | 210 | 0 | 221 | 0 | — |
| laramie-wy | real/1 | fertility | 0 | 75.2 | 56947 | 174 | 0 | 221 | 0 | 0.88 |
| laramie-wy | real/2 | legacy | 0 | 75.2 | 57081 | 150 | 0 | 158 | 0 | — |
| laramie-wy | real/2 | fertility | 0 | 75.2 | 57125 | 123 | 0 | 158 | 0 | 0.87 |
| laramie-wy | real/3 | legacy | 0 | 75.2 | 56114 | 211 | 0 | 222 | 0 | — |
| laramie-wy | real/3 | fertility | 0 | 75.2 | 55899 | 175 | 0 | 222 | 0 | 0.88 |
| asheville-nc | standard/1 | legacy | 0 | 75.2 | 59881 | 182 | 0 | 192 | 0 | — |
| asheville-nc | standard/1 | fertility | 0 | 75.2 | 59899 | 150 | 0 | 192 | 0 | 0.88 |
| asheville-nc | real/1 | legacy | 0 | 75.2 | 59955 | 178 | 0 | 188 | 0 | — |
| asheville-nc | real/1 | fertility | 0 | 75.2 | 59949 | 147 | 0 | 188 | 0 | 0.88 |
| asheville-nc | real/2 | legacy | 0 | 75.2 | 59926 | 152 | 0 | 160 | 0 | — |
| asheville-nc | real/2 | fertility | 0 | 75.2 | 59909 | 124 | 0 | 160 | 0 | 0.87 |
| asheville-nc | real/3 | legacy | 0 | 75.2 | 59890 | 184 | 0 | 194 | 0 | — |
| asheville-nc | real/3 | fertility | 0 | 75.2 | 59783 | 152 | 0 | 194 | 0 | 0.88 |

## Three-year garden checks

One adult, a Bell Tent, city water, one Raised Bed and one Potato Patch on the Front Range, Standard weather, three years each starting April 11 with 30 lb of seed potatoes added each spring and seed on hand. Soil care varies: none; compost at the catalog rate (stock on hand); manure only (stock on hand); and a Clover Cover Crop beside the gardens with no compost. Legacy rules are shown for comparison: there a garden without compost does not crop at all.

| Care | Rules | Crops year 1 (lb) | Crops year 2 (lb) | Crops year 3 (lb) | Bed fertility end yr 1 / 2 / 3 | Patch fertility end yr 1 / 2 / 3 |
|---|---|---:|---:|---:|---|---|
| none | legacy | 0 | 0 | 0 | — / — / — | — / — / — |
| none | fertility | 129 | 101 | 79 | 0.69 / 0.45 / 0.26 | 0.45 / 0.26 / 0.11 |
| compost | legacy | 182 | 182 | 182 | — / — / — | — / — / — |
| compost | fertility | 150 | 157 | 162 | 1.00 / 1.00 / 1.00 | 0.77 / 0.82 / 0.86 |
| manure | fertility | 150 | 157 | 162 | 1.00 / 1.00 / 1.00 | 0.77 / 0.82 / 0.86 |
| clover cover crop | fertility | 141 | 133 | 127 | 0.87 / 0.76 / 0.68 | 0.63 / 0.58 / 0.54 |
