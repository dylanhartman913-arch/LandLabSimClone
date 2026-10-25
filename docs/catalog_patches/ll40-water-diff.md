# Catalog patch `ll40-water`: xlsx diff summary

Upgrade Roadmap 2. References and explicit game assumptions are recorded in each row. Existing rows are unchanged.

## Rows added

| Sheet | Rows |
|---|---|
| Systems | 180, 181, 182, 183, 184 |
| Flows | 823, 824, 825, 826, 827, 828, 829, 830, 831 |
| Matrix | 180, 181, 182, 183, 184 |
| Resources | 65 |

## Validation and highlighting extended

- Systems data validation (whole) R2:R179 -> R2:R184
- Matrix conditional formatting (3 rules) B2:BK179 -> B2:BK184

## Systems added

- **Spring Box with Gravity Line** (Water-System): input Labor 0.25 Weekly; output Water 175 Weekly
- **First-Flush Diverter** (Water-System): input Labor 0.1 Weekly
- **Potable Water Tank (100 gal)** (Water-System; Storage): input Labor 0.05 Weekly; output Potable water storage 100 Capacity
- **Heat-Traced Water Tank (100 gal)** (Water-System; Storage): input Labor 0.1 Weekly; output Water storage 100 Capacity
- **Water Test Kit** (Water-System): input Labor 0.25 Weekly; input Capital 1 Weekly

## Existing cells

- Typed values (numbers and text) changed: **0** (the text edits above, if any; never a number)
- Formulas whose text changed (system/resource lookup ranges extended for new rows): **3361**
- Computed values that changed after recalculation: **6**
  - Resources!F2: 10 -> 11
  - Resources!G24: 156 -> 161
  - Resources!G25: 20 -> 21
  - Resources!F31: 6 -> 7
  - Categories!C7: 15 -> 20
  - Categories!C15: 11 -> 13

Computed values that change are counts over the whole catalog (systems per category, systems producing or using a resource) and the flags computed from those counts (a category's "Within target?"); none of them is a flow quantity, a cost, or a checklist result.
