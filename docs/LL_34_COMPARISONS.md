# LL-34 tools multiply gathering comparisons

Reproduce with `node --import tsx packages/cli/bots/tools.ts`. LL-34 remains an opt-in experimental setting; nothing here changes defaults. Multipliers and fuel rates are game balance derived from the catalog rows (see `docs/LL_34.md`).

## First-year routes

Two adults, greenfield remote-job tutorial policy, 365 days. Both variants buy the same prebuilt Chainsaw on day 1 with a standing order keeping 1–3 gal of gasoline. Legacy: the chainsaw makes 150 lb of wood a week on its own. Tools: it multiplies gathering at the deadfall instead. Settings otherwise match current game defaults; ordinary supplies. Standard seed 1 and Real seeds 1–3 at each site.

| Site | Weather/seed | Variant | Survival short days | Min wellbeing | End cash | Wood from chainsaw alone (lb) | Wood gathered at nodes (lb) | Firewood hours | Chainsaw hours at nodes | Gasoline used (gal) | Deadfall left at year end (lb) |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| front-range | standard/1 | legacy | 0 | 75.2 | 56857 | 7020 | 5096 | 134.4 | 0.0 | 10.40 | 8 |
| front-range | standard/1 | tools | 0 | 75.2 | 57902 | 0 | 5188 | 80.5 | 76.3 | 6.94 | 8 |
| front-range | real/1 | legacy | 0 | 75.2 | 56440 | 7020 | 5096 | 134.4 | 0.0 | 10.40 | 8 |
| front-range | real/1 | tools | 0 | 75.2 | 57566 | 0 | 5188 | 80.5 | 76.3 | 6.94 | 8 |
| front-range | real/2 | legacy | 0 | 75.2 | 56459 | 7020 | 5096 | 134.4 | 0.0 | 10.40 | 8 |
| front-range | real/2 | tools | 0 | 75.2 | 57339 | 0 | 5188 | 80.5 | 76.3 | 6.94 | 8 |
| front-range | real/3 | legacy | 0 | 75.2 | 55742 | 7020 | 5096 | 134.4 | 0.0 | 10.40 | 8 |
| front-range | real/3 | tools | 0 | 75.2 | 56837 | 0 | 5188 | 80.5 | 76.3 | 6.94 | 8 |
| laramie-wy | standard/1 | legacy | 0 | 75.2 | 56910 | 7020 | 1181 | 30.8 | 0.0 | 10.40 | 2 |
| laramie-wy | standard/1 | tools | 0 | 75.2 | 57179 | 0 | 1181 | 18.1 | 17.4 | 1.58 | 2 |
| laramie-wy | real/1 | legacy | 0 | 75.2 | 56745 | 7020 | 1181 | 30.8 | 0.0 | 10.40 | 2 |
| laramie-wy | real/1 | tools | 0 | 75.2 | 56869 | 0 | 1181 | 18.1 | 17.4 | 1.58 | 2 |
| laramie-wy | real/2 | legacy | 0 | 75.2 | 56986 | 7020 | 1181 | 30.8 | 0.0 | 10.40 | 2 |
| laramie-wy | real/2 | tools | 0 | 75.2 | 56891 | 0 | 1181 | 18.1 | 17.4 | 1.58 | 2 |
| laramie-wy | real/3 | legacy | 0 | 75.2 | 55846 | 7020 | 1181 | 30.8 | 0.0 | 10.40 | 2 |
| laramie-wy | real/3 | tools | 0 | 75.2 | 56055 | 0 | 1181 | 18.1 | 17.4 | 1.58 | 2 |
| asheville-nc | standard/1 | legacy | 0 | 75.2 | 59591 | 7020 | 11865 | 313.7 | 0.0 | 10.40 | 18 |
| asheville-nc | standard/1 | tools | 0 | 75.2 | 59574 | 0 | 12313 | 191.5 | 181.1 | 16.48 | 18 |
| asheville-nc | real/1 | legacy | 0 | 75.2 | 59578 | 7020 | 11865 | 313.7 | 0.0 | 10.40 | 18 |
| asheville-nc | real/1 | tools | 0 | 75.2 | 59601 | 0 | 12320 | 191.6 | 181.2 | 16.49 | 18 |
| asheville-nc | real/2 | legacy | 0 | 75.2 | 59616 | 7020 | 11844 | 313.2 | 0.0 | 10.40 | 18 |
| asheville-nc | real/2 | tools | 0 | 75.2 | 59676 | 0 | 12286 | 191.1 | 180.7 | 16.44 | 18 |
| asheville-nc | real/3 | legacy | 0 | 75.2 | 59446 | 7020 | 11858 | 313.5 | 0.0 | 10.40 | 18 |
| asheville-nc | real/3 | tools | 0 | 75.2 | 59580 | 0 | 12313 | 191.5 | 181.1 | 16.48 | 18 |

## Winter firewood checks

Two adults, a Bell Tent and three Tiny Wood Stoves from January 1 for 120 days, Standard weather, a 4-week firewood target, 50 gal of gasoline on hand, tools gate on in both variants. The hand variant owns no chainsaw.

| Site | Variant | Wood gathered (lb) | Firewood hours | Hours per 100 lb | Chainsaw hours | Gasoline (gal) | Deadfall left on day 120 (lb) | Days stoves were limited by wood |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| front-range | hand | 3144 | 83.6 | 2.66 | 0.0 | 0.00 | 8 | 0 |
| front-range | chainsaw | 3144 | 49.2 | 1.56 | 46.2 | 4.21 | 8 | 0 |
| laramie-wy | hand | 790 | 20.7 | 2.62 | 0.0 | 0.00 | 2 | 90 |
| laramie-wy | chainsaw | 790 | 12.2 | 1.54 | 11.6 | 1.06 | 2 | 90 |
| asheville-nc | hand | 3150 | 81.0 | 2.57 | 0.0 | 0.00 | 4190 | 0 |
| asheville-nc | chainsaw | 3150 | 47.6 | 1.51 | 46.3 | 4.22 | 4190 | 0 |
