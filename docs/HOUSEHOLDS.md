# Household scaling

Reproduce with `npm run sim -- households --md docs/HOUSEHOLDS.md`. Every start, every site, each household the start screen allows, Standard weather, idle for a year with the rules a new game sets. A household passes on a site when no kit row (drinking water, shelter, heat on a cold day, sanitation) starts more than 5 points below the start's default household on day 3, and the idle household stays home within 21 days of the default one. **Fixed kit** is the kit before scaling.

| Start | Household | Sites passing (fixed → scaled) | Idle household leaves (fixed → scaled) | Lowest kit row on day 3 (fixed → scaled) |
|---|---|---|---|---|
| adapt | 1 adult | 6/6 → 6/6 | home → home | Drinking water 100% → Drinking water 100% |
| adapt | 2 adults | 6/6 → 6/6 | home → home | Drinking water 100% → Drinking water 100% |
| adapt | 2 adults + 2 children | 0/6 → 6/6 | day 29 → home | Sanitation 59% → Drinking water 100% |
| adapt | 3 adults | 0/6 → 6/6 | day 234–day 248 → home | Sanitation 67% → Drinking water 100% |
| adapt | 4 adults | 0/6 → 6/6 | day 28 → home | Sanitation 50% → Sanitation 100% |
| adapt | 4 adults + 3 children | 0/6 → 6/6 | day 22 → home | Sanitation 33% → Drinking water 100% |
| greenfield | 1 adult | 6/6 → 6/6 | day 79–day 87 → day 79–day 87 | Heated shelter 81% → Heated shelter 81% |
| greenfield | 2 adults | 6/6 → 6/6 | day 76–day 78 → day 76–day 78 | Sanitation 50% → Sanitation 50% |
| greenfield | 2 adults + 2 children | 0/6 → 6/6 | day 18 → day 74–day 76 | Sanitation 29% → Sanitation 59% |
| greenfield | 3 adults | 0/6 → 6/6 | day 19 → day 75–day 76 | Sanitation 33% → Sanitation 67% |
| greenfield | 4 adults | 0/6 → 6/6 | day 17 → day 71–day 72 | Sanitation 25% → Sanitation 50% |
| greenfield | 4 adults + 3 children | 0/6 → 6/6 | day 15 → day 61–day 65 | Sanitation 16% → Sanitation 66% |
| cabin | 1 adult | 6/6 → 6/6 | day 70–day 74 → day 70–day 74 | Heated shelter 59% → Heated shelter 59% |
| cabin | 2 adults | 6/6 → 6/6 | day 64–day 67 → day 64–day 67 | Heated shelter 59% → Heated shelter 59% |
| cabin | 2 adults + 2 children | 0/6 → 6/6 | day 61–day 63 → day 64–day 66 | Sanitation 59% → Heated shelter 66% |
| cabin | 3 adults | 0/6 → 6/6 | day 62–day 64 → day 65–day 67 | Heated shelter 59% → Heated shelter 59% |
| cabin | 4 adults | 0/6 → 6/6 | day 60–day 62 → day 63–day 65 | Sanitation 50% → Heated shelter 66% |
| cabin | 4 adults + 3 children | 0/6 → 6/6 | day 39–day 40 → day 61–day 63 | Sanitation 33% → Heated shelter 74% |
| farm | 1 adult | 6/6 → 6/6 | home → home | Sanitation 88% → Sanitation 88% |
| farm | 2 adults | 6/6 → 6/6 | home → home | Sanitation 88% → Sanitation 88% |
| farm | 2 adults + 2 children | 0/6 → 6/6 | home → home | Sanitation 59% → Sanitation 87% |
| farm | 3 adults | 0/6 → 6/6 | home → home | Sanitation 67% → Sanitation 88% |
| farm | 4 adults | 0/6 → 6/6 | day 75 → home | Sanitation 50% → Sanitation 88% |
| farm | 4 adults + 3 children | 0/6 → 6/6 | day 32 → home | Sanitation 33% → Sanitation 87% |
