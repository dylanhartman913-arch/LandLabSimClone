# Catalog patch `ll45-heat-efficiency`: xlsx diff summary

Three Upgrade Roadmap 2 heat, hot water and shelter-efficiency systems. Existing workbook numbers are unchanged. Heat-need reductions are engine modifiers in catalog_overrides.json; all quantities are labeled game assumptions in row notes.

## Rows added

| Sheet | Rows |
|---|---|
| Systems | 203, 204, 205 |
| Flows | 880, 881, 882, 883, 884, 885 |
| Matrix | 203, 204, 205 |
| Resources | (none) |

## Validation and highlighting extended

- Systems data validation (whole) R2:R202 -> R2:R205
- Matrix conditional formatting (3 rules) B2:BK202 -> B2:BK205

## Systems added

- **Canvas Tent Winter Liner** (Heating; Canvas): input Labor 0.05 Weekly
- **Wood Boiler with Water Jacket** (Heating): input Labor 0.5 Weekly; input Woody biomass 50 Weekly; output Heat 150000 Weekly; output Hot water 140 Weekly
- **Draft-Proofing Kit (small shelter)** (Heating; Cooling): input Labor 0.02 Weekly

## Existing cells

- Typed values (numbers and text) changed: **0** (the text edits above, if any; never a number)
- Formulas whose text changed (system/resource lookup ranges extended for new rows): **954**
- Computed values that changed after recalculation: **7**
  - Resources!F4: 3 -> 4
  - Resources!F22: 14 -> 15
  - Resources!G24: 179 -> 182
  - Resources!G38: 13 -> 14
  - Categories!C18: 6 -> 7
  - Categories!C22: 7 -> 8
  - Categories!C23: 13 -> 16

Computed values that change are counts over the whole catalog (systems per category, systems producing or using a resource) and the flags computed from those counts (a category's "Within target?"); none of them is a flow quantity, a cost, or a checklist result.
