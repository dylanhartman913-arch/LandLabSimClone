# LL-46 income and trade comparisons

Reproduce with `node --import tsx packages/cli/bots/income.ts`. Controlled equipment checks, not survival-route claims: household food, water and cash supplied, wellbeing drift disabled, Standard weather, seed 1, January 1–December 31, Selling and trade on. No defaults change.

## A CSA season

One adult, a CSA and two root cellars, for a year from the site’s first growing day. "Fully supplied" backfills produce from unlimited supply; "half the season" starts with 312 lb of stored produce, half the season’s 624 lb of boxes; "no produce" has none. Net is revenue minus make-good, before the $150 purchase. Growing-season flows keep the workbook’s annual total, so every site promises the same $2,346 over its own season length.

| Site | Supply | Season (days) | Boxes packed | Revenue ($) | Make-good ($) | Net ($) | Packing labor (h) |
|---|---|---:|---:|---:|---:|---:|---:|
| front-range | fully supplied | 154 | 100.0% | 2346 | 0 | 2346 | 104.3 |
| front-range | half the season | 154 | 11.7% | 274 | 1036 | -762 | 12.2 |
| front-range | no produce | 154 | 0.0% | 0 | 1173 | -1173 | 0.0 |
| laramie-wy | fully supplied | 98 | 100.0% | 2346 | 0 | 2346 | 104.3 |
| laramie-wy | half the season | 98 | 16.3% | 383 | 982 | -599 | 17.0 |
| laramie-wy | no produce | 98 | 0.0% | 0 | 1173 | -1173 | 0.0 |
| asheville-nc | fully supplied | 184 | 100.0% | 2346 | 0 | 2346 | 104.3 |
| asheville-nc | half the season | 184 | 10.3% | 241 | 1052 | -811 | 10.7 |
| asheville-nc | no produce | 184 | 0.0% | 0 | 1173 | -1173 | 0.0 |

A full season earns $45 a growing-season week. The make-good means a CSA that cannot fill its boxes loses more than a stand that simply sells less: with no produce it pays out half the promised revenue. The half-season stock lasts about three weeks, not half the season, because the household eats its most perishable food first (about 13 lb of produce a day here, alongside the CSA’s 4). Boxes come before meals each day, but nothing reserves produce for later boxes.

## Spinning a year of wool

One adult and a spinning wheel with 26 lb of stored wool (about a year from a three-sheep flock), then every woolen good sold at the 50% sale rate. Compared with selling the same wool raw at 50% of its $4/lb reference.

| Site | Wool spun (lb) | Woolen goods made (lb) | Spinning labor (h) | Goods sale value at 50% ($) | Raw wool sale value at 50% ($) | Value added per hour ($) |
|---|---:|---:|---:|---:|---:|---:|
| front-range | 26.00 | 23.40 | 208.0 | 292.50 | 52.00 | 1.16 |
| laramie-wy | 26.00 | 23.40 | 208.0 | 292.50 | 52.00 | 1.16 |
| asheville-nc | 26.00 | 23.40 | 208.0 | 292.50 | 52.00 | 1.16 |

## Spare work for Ruth

One adult after the tutorial, a standing order of 4 hours of spare work a week for chicken feed, filled as spare labor allows, 12 weeks from June 21. The household has no other work, so the order fills each time it is renewed.

| Site | Hours worked | Chicken feed received (lb) | Goods value ($) | Cash spent ($) |
|---|---:|---:|---:|---:|
| front-range | 48.0 | 1645.7 | 576 | 0 |
| laramie-wy | 48.0 | 1645.7 | 576 | 0 |
| asheville-nc | 48.0 | 1645.7 | 576 | 0 |

Limits: CSA members never cancel or renew, there is no box mix or delivery route, and produce is pooled; spinning abstracts washing, carding and dyeing into one rate; Ruth has unlimited goods and work. Prices and the make-good are experimental balance; scope is in `LL_46.md`.
