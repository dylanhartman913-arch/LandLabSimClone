# Catalog patch `ll42-feed-fodder`: xlsx diff summary

Three Upgrade Roadmap 2 animal-feed systems. Existing workbook numbers are unchanged. Reference quantities and game assumptions are distinguished in row notes.

## Rows added

| Sheet | Rows |
|---|---|
| Systems | 191, 192, 193 |
| Flows | 847, 848, 849, 850, 851, 852, 853, 854, 855, 856 |
| Matrix | 191, 192, 193 |
| Resources | 68 |

## Validation and highlighting extended

- Systems data validation (whole) R2:R190 -> R2:R193
- Matrix conditional formatting (3 rules) B2:BK190 -> B2:BK193

## Systems added

- **Hay Meadow (1/10 acre)** (Land): input Labor 0.3 Weekly; input Rainfall (rain formula) Weekly; output Hay 4 Weekly
- **Poultry Feed Mix** (Food System): input Labor 1 Weekly; input Grain 7 Weekly; input Green biomass 2 Weekly; input Grubs 1 Weekly; output Chicken feed 9 Weekly
- **Hay Barn** (Storage): input Labor 0.1 Weekly; output Feed storage 200 Capacity

## Existing cells

- Typed values (numbers and text) changed: **0** (the text edits above, if any; never a number)
- Formulas whose text changed (system/resource lookup ranges extended for new rows): **3457**
- Computed values that changed after recalculation: **10**
  - Resources!G9: 2 -> 3
  - Resources!G24: 167 -> 170
  - Resources!G27: 5 -> 6
  - Resources!G42: 11 -> 12
  - Resources!F43: 2 -> 3
  - Resources!F52: 1 -> 2
  - Resources!G53: 4 -> 5
  - Categories!C9: 19 -> 20
  - Categories!C15: 17 -> 18
  - Categories!C24: 9 -> 10

Computed values that change are counts over the whole catalog (systems per category, systems producing or using a resource) and the flags computed from those counts (a category's "Within target?"); none of them is a flow quantity, a cost, or a checklist result.
