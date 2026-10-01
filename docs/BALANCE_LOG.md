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
