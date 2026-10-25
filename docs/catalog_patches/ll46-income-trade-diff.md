# Catalog patch `ll46-income-trade`: xlsx diff summary

Two Upgrade Roadmap 2 income systems and one resource. Existing workbook numbers are unchanged. The farm stand and Ruth's produce barter shipped in LL-29 (S178); labor barter is an engine rule. All prices and rates are labeled game assumptions in row notes.

## Rows added

| Sheet | Rows |
|---|---|
| Systems | 206, 207 |
| Flows | 886, 887, 888, 889, 890, 891, 892 |
| Matrix | 206, 207 |
| Resources | 69 |

## Validation and highlighting extended

- Systems data validation (whole) R2:R205 -> R2:R207
- Matrix conditional formatting (3 rules) B2:BK205 -> B2:BK207

## Systems added

- **CSA Share Program (4 half shares)** (Garden; Tools): input Labor 2 Weekly; input Vegetables fruit fiber herbs 12 Weekly; output Capital 45 Weekly
- **Spinning Wheel and Loom** (Tools): input Labor 4 Weekly; input Wool 0.5 Weekly; output Woolen goods 0.45 Weekly; output Wellbeing 4 Weekly

## Existing cells

- Typed values (numbers and text) changed: **0** (the text edits above, if any; never a number)
- Formulas whose text changed (system/resource lookup ranges extended for new rows): **3613**
- Computed values that changed after recalculation: **8**
  - Resources!G7: 1 -> 2
  - Resources!G24: 182 -> 184
  - Resources!F25: 3 -> 4
  - Resources!G59: 0 -> 1
  - Resources!H59: 'End product (no consumer)' -> 'Intermediate (made and used)'
  - Resources!F63: 37 -> 38
  - Categories!C13: 13 -> 14
  - Categories!C20: 13 -> 15

Computed values that change are counts over the whole catalog (systems per category, systems producing or using a resource) and the flags computed from those counts (a category's "Within target?"); none of them is a flow quantity, a cost, or a checklist result.
