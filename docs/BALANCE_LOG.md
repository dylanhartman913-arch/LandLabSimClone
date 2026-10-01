# Balance log

Every tuned constant, why it has the value it has, and the gate results it was tuned against. Per the playability roadmap (G16, "Tuning loop"), only these may be tuned:
- start configs (`data/starts/*.json`);
- node yields (`data/sites/*.json` → `nodes`);
- wellbeing constants (`packages/engine/src/time/wellbeing.ts`);
- quest rewards (`data/quests/*.json`).

Catalog quantities are never tuned.

## G15: first values

### Start configs

| Constant | Value | Roadmap said | Why |
|---|---|---|---|
| Greenfield food | 200,000 kcal (household of 2) | "600,000 kcal … 3 weeks at full ration" | The roadmap's two numbers disagree. 600,000 kcal is 21 weeks for two people at the catalog's 14,000 kcal a person a week, and 3 weeks is 84,000 kcal. The same section asks the kit to carry two people "about 6–8 weeks … then decline slowly". 200,000 kcal is 7 weeks. |
| Greenfield seed potatoes | omitted | 25 lbs | The catalog has no seed-potato resource. As Root crops they would simply be eaten (8,750 kcal). |
| `startDay` | `"spring"`: 30 days before the site's last frost | "spring, day 1" | A fixed March 21 start puts Laramie (HDD 35 a day in late March) past what a tiny stove and a canvas tent can carry, even with bedding. A site-relative spring keeps the first winter about 9 months off everywhere. |
| Adapt vehicles | 2 × Average American Vehicle | 1 vehicle | Two people (300 miles) + the job (150) + groceries (10) need 460 miles a week, and one car makes 250. With one car, Transportation sits at 54% and the job and groceries go unserved. Two cars is the US norm for a two-adult household. |
| Adapt gas station | added | not listed | The cars need gasoline, and the Gas Station is the backstop that sells it. |
| Adapt `backstopCapMult` | 8 | (G12 engine default 3) | The grid is the house's furnace. A 2,000 sq ft house needs about 2.9M BTU a week in a Front Range January, and the Central Power Plant's catalog heat is 500,000 a week, so 3× falls short. A utility connection isn't rate-limited the way a delivery is. |
| Difficulty Gentle | wellbeing penalties × 0.5, stockpile × 1.5 | "slow wellbeing loss, generous stockpile" | |

### Wellbeing constants (initial)

| Constant | Value | Why |
|---|---|---|
| `WB_START` | 75 | Roadmap. |
| `WB_RECOVERY` / `WB_COMFORT_RECOVERY` | 0.6 / 0.4 | Roadmap ("+0.6 … more with comfort coverage"). |
| `WB_MAX_LOSS` | 8 | Roadmap. |
| Drinking water: short / grace / weight | 80% / 1 day / 10 | Grace from the roadmap. The heaviest weight, because water is the fastest danger. |
| Food: short / grace / weight | 50% (20%) / 4 days (1) / 4 | Grace from the roadmap. A weight of 4 a day at zero food makes a person go to town about 18–20 days after the pantry runs out: "declines slowly rather than collapsing". |
| Shelter: short / grace / weight | 50% / 2 days / 5 | A canvas wall tent gives two people 56% of the catalog's 200 sq ft each: crowded, not unsheltered (drift only). |
| Heat: short / grace / weight | 50% / 1 night / 5 | Grace from the roadmap. |
| `HEAT_BEDDING_HDD` | 20 | The catalog's Tiny Wood Stove makes 200,000 BTU a week. The Canvas Wall Tent loses about 806,000 BTU a week on average, so the kit stove covers about 25%. Without a bedding allowance, every greenfield start would be a heat hardship from night 2. With 20 °F-days of bedding, spring is fine on all three sites, and a Laramie January in a tent is a hardship, as it should be. |
| Sanitation: short / grace / weight | 50% / 7 days / 2 | The humanure bucket handles exactly half of two people's waste (17.5 of 35 lbs a week). It is not short, so it drifts. |
| Comfort weights | electricity 0.25, cooling 0.25, transport 0.15, hot water 0.15, cooked meals 0.2 | They sum to 1, so a camp with no comfort at all still recovers (+0.6) when survival is met. |
| Service bonus | 0.05 a point a person a week, at most 0.5 | The firepit's 5 points a week for two people is +0.125 a day. |
| `WB_AWAY_MIN_DAYS` / `WB_RETURN_AT` | 14 / 50 | |

### Gate results (G15 pacing tests, `packages/engine/test/starts.test.ts`, seed 1)

| Start | Site | First hardship | First to town | Wellbeing day 42 | Gate |
|---|---|---|---|---|---|
| Greenfield Standard idle | Front Range | day 52 (food) | day 70 | ≥ 50 | ✓ (≥ 28, ≥ 60) |
| Greenfield Standard idle | Laramie | day 52 (food) | day 71 | ≥ 50 | ✓ |
| Greenfield Standard idle | Asheville | day 52 (food) | day 70 | ≥ 50 | ✓ |
| Greenfield Gentle idle | all three | day 77 | day 116 or later | — | ✓ (≥ 90) |
| Adapt Standard idle, 2 years | all three | none | none | 100 | ✓ (wellbeing ≥ 70, self-reliance < 5%) |

## G16: the tuning loop

The bots (`packages/cli/bots/`) played every gate on 3 sites × 3 seeds (`npm run test:pacing`). Each row below is one change, in the order it was made, with what it fixed. Every change is to data or a wellbeing-adjacent constant, except the four engine fixes, which are bugs the bots found rather than tuning.

### Engine fixes the bots found (not tuning)

| Fix | Symptom in the bot runs |
|---|---|
| Upkeep is job priority 1, not 3 (`time/gather.ts`). | While the coop and the mass heater were being built, construction plus survival gathering took the whole labor pool. The water filter and the toilet got no upkeep for 10 days, and wellbeing fell 30 points to a summer plateau of 57. |
| Flow boosts draw on stock (`time/step.ts`). | Boost inputs that are Flows (the coop's scraps, greens, and carbon) were measured against Service output only, so they were always 0%. Every coop in every design laid about a third fewer eggs. |
| Seed is kept from meals (`seedReserve`). | People ate the potato patch's 25 lbs of seed potatoes before planting season. A planted or being-planted system's per-season food seed is now held back. |
| Weekly bills include running costs (house, cars). | "Weekly bills" counted only groceries and utilities. The adapt tutorial's last lever (a part-time job, one car) didn't show at all. Cash accounting is unchanged: running costs were always cash out. |

### Data changes

| # | Change | Kind | Why |
|---|---|---|---|
| 1 | Greenfield stockpile: no seed potatoes. Quest 2's reward gives 25 lbs instead ("Ruth splits her seed potatoes"). | start config, quest reward | They would be eaten before a patch existed to reserve them. |
| 2 | Quest 3's steps also plant a Potato Patch, and buy 250 lbs of compost. | quest content | The only planting that can carry a quarter of the food in the first season. |
| 3 | Quest 4 uses a Bokashi Bucket, not Compost Piles. | quest content | The pile took all the wild greens, so the hens got none. The bucket composts kitchen scraps under leaf litter, which matches the title. |
| 4 | Quest 5's standing grocery order keeps above 14,000 kcal (half a week), up to 42,000. | quest content | Below one week of food, the auto-forage rule works the meadow between deliveries. |
| 5 | Quest 6 adds 20 hours a week of foraging. | quest content | 5.9 hours a day of labor sat idle. Greens feed the hens (their boost) and the table. |
| 6 | Quest 7: cold-snap threshold HDD 22 (was 30); a standing firewood order; a reward of $600 and 600 lbs of oak. | quest goal, content, reward | Asheville never reaches HDD 30. Deadfall can't carry three fires through a winter (about 7,800 lbs a year). |
| 7 | Rewards: water $200 + 10 gal; firewood $300; bed $300 + 200 lbs compost; compost $200 + 50 lbs feed; auto-water 80,000 kcal; hens $500. | quest rewards | $8,000 doesn't buy a year of groceries, firewood, and feed (about $160 a week) plus builds. Without these, cash ran out in late winter on every site. |
| 8 | Wild greens: produce by-product 0.5 → 1.0 lb per hour, regrowth 3 → 5 lbs a day. | node yields | Home-grown food stuck at 22–24%. |
| 9 | Asheville: a second wild-greens patch. | site nodes | The wettest site had fewer greens than the Front Range. |
| 10 | Springs: 25 gal per hour (Front Range was 15, Laramie 12), the roadmap's table value. | node yields | In a dry real-weather Laramie spring, the spring couldn't keep up once the beds and potatoes drank. The filter starved, and people went to town by day 59. |
| 11 | Adapt quest 8: sell the second car, and put the commute and the grocery run first. | quest content | With a part-time job, one car (250 miles) covers the commute and groceries. Leisure miles take the cut (a comfort drift). |

### Gate results after tuning (`npm run test:pacing`, seeds 1–3)

| Gate | Front Range | Laramie | Asheville |
|---|---|---|---|
| Greenfield Standard idle: first hardship ≥ 28, nobody leaves < 60 | hardship day 53–54, nobody leaves | same | same |
| Greenfield Standard tutorialFollower: every month ≥ 60; home-grown ≥ 25% by frost | lowest month 78; 31% | 78; 32% | 77; 29% |
| Greenfield Gentle idle: nobody leaves < 90 | ✓ | ✓ | ✓ |
| Greenfield Real weather tutorialFollower: survives in ≥ 2 of 3 | 3 of 3 | 3 of 3 | 3 of 3 |
| Adapt Standard adaptUpgrader: bills −20%, wellbeing ≥ 70 | $807 → $627 (−22%), lowest 76 | −22%, 76 | −22%, 76 |

**Open for the designer:**
- Real weather doesn't bite: all 9 seeds survive year 1. The roadmap hoped it would ("difficulty should bite"), but the gate only asks for at least 2 of 3. Raising `wellbeingMult` for Real weather to 1.25, or making its stockpile smaller, would make it bite.
- The tutorial follower lands on 77–78 for its lowest month. Comfort drift (no hot water, no car, a crowded tent) holds a camp at about 80, which is the intended "you can live like this, but you'd want more".
