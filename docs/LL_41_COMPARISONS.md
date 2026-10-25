# LL-41 controlled processing comparisons

Reproduce with `node --import tsx packages/cli/bots/water-food-expansion.ts`. Same isolated camp controls as LL-40; food preservation enabled. One-day batches on June 22, 100 canonical units of fresh input, 100 units energy supplied at dawn. Processing takes surplus after household use. Rates are experimental balance; see LL_41.md.

| Processor | Input | Input kcal | Preserved kcal | Labor (h) | Energy resource | Energy used |
|---|---|---:|---:|---:|---|---:|
| Pressure Canner | Root crops | 12000 | 10800 | 6.00 | Cooking fuel | 2.40 |
| Water-Bath Canner | Vegetables fruit fiber herbs | 6000 | 5400 | 3.00 | Cooking fuel | 1.20 |
| Solar Dehydrator | Vegetables fruit fiber herbs | 6000 | 5400 | 1.80 | Sunlight | 3.00 |
| Electric Dehydrator | Meat | 6000 | 5400 | 1.80 | Electricity | 4.80 |
| Smokehouse | Fish | 6000 | 5100 | 2.40 | Woody biomass | 3.00 |

## Grain storage

30 days, 100 lb grain and a root cellar in both variants; the household eats grain before generic Food. The added bin protects 450 lb from rodents. Food capacity is not binding.

| Storage | Grain spoiled (lb) | Grain left (lb) |
|---|---:|---:|
| Root Cellar | 3.454 | 56.546 |
| Grain Bin | 0.136 | 59.864 |

## Milk and seed conversions

Seven days; 10 gal milk, 100 lb produce and a root cellar. Compare the same stock with or without both stations. Inputs used for processing are separate from meals; no newly grown calories are credited.

| Stations | Milk processed (gal) | Cheese made (lb) | Produce saved for seed (lb) | Seeds made (oz) |
|---|---:|---:|---:|---:|
| none | 0.00 | 0.00 | 0.00 | 0.00 |
| press + seed station | 1.25 | 1.00 | 1.00 | 1.00 |
