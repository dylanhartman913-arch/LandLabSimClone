# Alert coverage (LL-49)

Reproduce with `npm run sim -- coverage --md docs/LL_49_COVERAGE.md`. Real weather, 365 days, the rules a new game sets. A cliff passes when one of its alerts was on the Needs and bottlenecks list, in an allowed section, every morning for at least 7 days before it (feed: 6). Lead = mornings in a row the warning was listed, ending on the cliff day. Rank = its place in the list on the first of those mornings (1 = top). Forecast = days before the cliff that the 90-day forecast first named it; context only, never counted.

| Cliff | Measured to | Alerts that count | Lead needed |
|---|---|---|---|
| Food | first Food wellbeing penalty | food-runway, food (now/soon) | 7 |
| Safe water | first Drinking water wellbeing penalty | water-runway, drinkingWater (now/soon) | 7 |
| Carbon (sawdust) | first Sanitation wellbeing penalty after Carbon runs short | Carbon, sanitation (now/soon) | 7 |
| Fuel (firewood, propane) | first Heat wellbeing penalty after firewood or propane runs short | Woody biomass, Propane, heat (now/soon) | 7 |
| Chicken feed | first day Chicken feed runs short (no wellbeing penalty) | Chicken feed (now/soon/supplies) | 6 |
| Cash | first day cash ends below $1 | cash-runway (now/soon) | 7 |

| Scenario | Site | Seed | Cliff | Day | Lead | Warning | Rank | Forecast | Result |
|---|---|---|---|---|---|---|---|---|---|
| October 22 playtest (original line, ignores alerts) | front-range | 1 | Carbon (sawdust) | 91 | 11 | Carbon | 1 | 76 | pass |
| October 22 playtest (original line, ignores alerts) | front-range | 2 | Carbon (sawdust) | 90 | 10 | Carbon | 1 | 75 | pass |
| October 22 playtest (original line, ignores alerts) | front-range | 3 | Carbon (sawdust) | 90 | 10 | Carbon | 1 | 75 | pass |
| October 22 playtest (original line, ignores alerts) | laramie-wy | 1 | Carbon (sawdust) | 90 | 10 | Carbon | 1 | 75 | pass |
| October 22 playtest (original line, ignores alerts) | laramie-wy | 1 | Fuel (firewood, propane) | 120 | 17 | Woody biomass | 3 | 0 | pass |
| October 22 playtest (original line, ignores alerts) | laramie-wy | 2 | Carbon (sawdust) | 90 | 10 | Carbon | 1 | 75 | pass |
| October 22 playtest (original line, ignores alerts) | laramie-wy | 2 | Fuel (firewood, propane) | 120 | 19 | Woody biomass | 3 | 0 | pass |
| October 22 playtest (original line, ignores alerts) | laramie-wy | 3 | Carbon (sawdust) | 90 | 10 | Carbon | 1 | 75 | pass |
| October 22 playtest (original line, ignores alerts) | laramie-wy | 3 | Fuel (firewood, propane) | 120 | 18 | Woody biomass | 3 | 0 | pass |
| October 22 playtest (original line, ignores alerts) | asheville-nc | 1 | Carbon (sawdust) | 90 | 10 | Carbon | 1 | 75 | pass |
| October 22 playtest (original line, ignores alerts) | asheville-nc | 2 | Carbon (sawdust) | 90 | 10 | Carbon | 1 | 75 | pass |
| October 22 playtest (original line, ignores alerts) | asheville-nc | 3 | Carbon (sawdust) | 90 | 10 | Carbon | 1 | 75 | pass |
| No automatic water gathering (ignores alerts) | front-range | 1 | Safe water | 30 | 7 | water-runway | 1 | 29 | pass |
| No automatic water gathering (ignores alerts) | laramie-wy | 1 | Safe water | 30 | 7 | water-runway | 1 | 29 | pass |
| No automatic water gathering (ignores alerts) | asheville-nc | 1 | Safe water | 30 | 7 | water-runway | 1 | 29 | pass |
| $600 starting cash (ignores alerts) | front-range | 1 | Food | 173 | 7 | food-runway | 2 | 172 | pass |
| $600 starting cash (ignores alerts) | front-range | 1 | Chicken feed | 171 | 6 | Chicken feed | 3 | — | pass |
| $600 starting cash (ignores alerts) | front-range | 1 | Cash | 161 | 19 | cash-runway | 1 | 83 | pass |
| $600 starting cash (ignores alerts) | laramie-wy | 1 | Food | 166 | 8 | food-runway | 2 | 165 | pass |
| $600 starting cash (ignores alerts) | laramie-wy | 1 | Fuel (firewood, propane) | 183 | 8 | Woody biomass | 3 | — | pass |
| $600 starting cash (ignores alerts) | laramie-wy | 1 | Chicken feed | 171 | 6 | Chicken feed | 4 | — | pass |
| $600 starting cash (ignores alerts) | laramie-wy | 1 | Cash | 161 | 26 | cash-runway | 1 | — | pass |
| $600 starting cash (ignores alerts) | asheville-nc | 1 | Food | 172 | 9 | food-runway | 2 | 171 | pass |
| $600 starting cash (ignores alerts) | asheville-nc | 1 | Chicken feed | 170 | 6 | Chicken feed | 4 | — | pass |
| $600 starting cash (ignores alerts) | asheville-nc | 1 | Cash | 160 | 29 | cash-runway | 1 | 89 | pass |

Runs that reach no cliff (every novice gate run among them) pass without a row.
