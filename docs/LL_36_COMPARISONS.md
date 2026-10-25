# LL-36 household composition and skills comparisons

Reproduce with `node --import tsx packages/cli/bots/household.ts`. LL-36 remains an opt-in experimental setting; nothing here changes defaults. Role shares, skill curves and risks are game balance (see `docs/LL_36.md`). The skill column shows the best individual bonus in the household at year end.

## First-year routes

Two adults, greenfield remote-job tutorial policy, 365 days. The variants differ only in the setting: both households are all adult, so this measures skills, illness and injury on the default route. Settings otherwise match current game defaults; ordinary supplies. Standard seed 1 and Real seeds 1–3 at each site.

| Site | Weather/seed | Variant | Survival short days | Min wellbeing | End cash | Food bought ($) | Construction hours | Illnesses | Injuries | Days lost to illness/injury | Household building / growing / gathering bonus at year end |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| front-range | standard/1 | legacy | 0 | 75.2 | 58050 | 5871 | 93 | 0 | 0 | 0 | — / — / — |
| front-range | standard/1 | roles | 0 | 75.2 | 59446 | 5881 | 89 | 0 | 0 | 0 | 9% / 4% / 29% |
| front-range | real/1 | legacy | 0 | 75.2 | 57700 | 5878 | 93 | 0 | 0 | 0 | — / — / — |
| front-range | real/1 | roles | 0 | 75.2 | 59411 | 5865 | 89 | 0 | 0 | 0 | 9% / 4% / 29% |
| front-range | real/2 | legacy | 0 | 75.2 | 57614 | 5895 | 93 | 0 | 0 | 0 | — / — / — |
| front-range | real/2 | roles | 0 | 75.2 | 59319 | 5885 | 89 | 0 | 0 | 0 | 9% / 4% / 29% |
| front-range | real/3 | legacy | 0 | 75.2 | 57027 | 5869 | 93 | 0 | 0 | 0 | — / — / — |
| front-range | real/3 | roles | 0 | 75.2 | 59057 | 5878 | 89 | 0 | 0 | 0 | 9% / 4% / 29% |
| laramie-wy | standard/1 | legacy | 0 | 75.2 | 57249 | 5950 | 93 | 0 | 0 | 0 | — / — / — |
| laramie-wy | standard/1 | roles | 0 | 75.2 | 58513 | 5960 | 89 | 0 | 0 | 0 | 9% / 4% / 28% |
| laramie-wy | real/1 | legacy | 0 | 75.2 | 57014 | 5952 | 93 | 0 | 0 | 0 | — / — / — |
| laramie-wy | real/1 | roles | 0 | 75.2 | 58268 | 5964 | 89 | 0 | 0 | 0 | 9% / 4% / 28% |
| laramie-wy | real/2 | legacy | 0 | 75.2 | 57081 | 6149 | 93 | 0 | 0 | 0 | — / — / — |
| laramie-wy | real/2 | roles | 0 | 75.2 | 58188 | 6141 | 89 | 0 | 0 | 0 | 9% / 4% / 28% |
| laramie-wy | real/3 | legacy | 0 | 75.2 | 56114 | 5950 | 93 | 0 | 0 | 0 | — / — / — |
| laramie-wy | real/3 | roles | 0 | 75.2 | 57785 | 5961 | 89 | 0 | 0 | 0 | 9% / 4% / 28% |
| asheville-nc | standard/1 | legacy | 0 | 75.2 | 59881 | 5832 | 94 | 0 | 0 | 0 | — / — / — |
| asheville-nc | standard/1 | roles | 0 | 75.2 | 59983 | 5824 | 89 | 0 | 0 | 0 | 9% / 4% / 29% |
| asheville-nc | real/1 | legacy | 0 | 75.2 | 59955 | 5842 | 94 | 0 | 0 | 0 | — / — / — |
| asheville-nc | real/1 | roles | 0 | 75.2 | 60050 | 5834 | 89 | 0 | 0 | 0 | 9% / 4% / 29% |
| asheville-nc | real/2 | legacy | 0 | 75.2 | 59926 | 5832 | 94 | 0 | 0 | 0 | — / — / — |
| asheville-nc | real/2 | roles | 0 | 75.2 | 60009 | 5825 | 89 | 0 | 0 | 0 | 9% / 4% / 29% |
| asheville-nc | real/3 | legacy | 0 | 75.2 | 59890 | 5837 | 93 | 0 | 0 | 0 | — / — / — |
| asheville-nc | real/3 | roles | 0 | 75.2 | 60013 | 5829 | 89 | 0 | 0 | 0 | 9% / 4% / 29% |

## Household composition

A household in validation-supply mode (every need met, so only composition differs) with three Bell Tents, a Tiny Wood Stove and two Composting Outhouses, Front Range from April 1 for 28 days, Standard weather. The third person is an adult, a child or an elder; legacy rules treat everyone as an adult. Weekly figures are averages.

| Household | Rules | Food requested (kcal/week) | Drinking water requested (gal/week) | Household labor (h/week) | Paid-work cap (h/week) | Min wellbeing |
|---|---|---:|---:|---:|---:|---:|
| 3 adults | legacy | 42000 | 15.0 | 141.3 | 120 | 76.0 |
| 3 adults | roles | 42000 | 15.0 | 141.3 | 120 | 76.0 |
| 2 adults + child | roles | 37800 | 13.5 | 106.0 | 80 | 76.0 |
| 2 adults + elder | roles | 40600 | 14.5 | 117.7 | 100 | 76.0 |
