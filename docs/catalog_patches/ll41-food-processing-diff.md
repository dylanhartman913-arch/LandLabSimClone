# Catalog patch `ll41-food-processing`: xlsx diff summary

Upgrade Roadmap 2. References and explicit game assumptions are recorded in each row. Existing rows are unchanged.

## Rows added

| Sheet | Rows |
|---|---|
| Systems | 185, 186, 187, 188, 189, 190 |
| Flows | 832, 833, 834, 835, 836, 837, 838, 839, 840, 841, 842, 843, 844, 845, 846 |
| Matrix | 185, 186, 187, 188, 189, 190 |
| Resources | 66, 67 |

## Validation and highlighting extended

- Systems data validation (whole) R2:R184 -> R2:R190
- Matrix conditional formatting (3 rules) B2:BK184 -> B2:BK190

## Systems added

- **Water-Bath Canner** (Food System; Cooking; Storage): input Labor 0.25 Weekly; output Food storage 5 Capacity
- **Electric Dehydrator** (Food System; Storage): input Labor 0.1 Weekly; output Food storage 5 Capacity
- **Smokehouse** (Food System; Storage): input Labor 0.25 Weekly; output Food storage 10 Capacity
- **Cheese Press** (Food System): input Labor 1 Weekly; input Milk 1.25 Weekly; output Cheese 1 Weekly
- **Grain Bin** (Food System; Storage): input Labor 0.1 Weekly; output Food storage 10 Capacity; output Grain storage 450 Capacity
- **Seed Saving Station** (Food System): input Labor 0.5 Weekly; input Vegetables fruit fiber herbs 1 Weekly; output Seeds 1 Weekly

## Existing cells

- Typed values (numbers and text) changed: **0** (the text edits above, if any; never a number)
- Formulas whose text changed (system/resource lookup ranges extended for new rows): **3397**
- Computed values that changed after recalculation: **10**
  - Resources!G7: 0 -> 1
  - Resources!H7: 'Meets a human need' -> 'Intermediate (made and used)'
  - Resources!G13: 0 -> 1
  - Resources!H13: 'Meets a human need' -> 'Intermediate (made and used)'
  - Resources!G24: 161 -> 167
  - Resources!F33: 5 -> 9
  - Resources!F54: 2 -> 3
  - Categories!C9: 13 -> 19
  - Categories!C15: 13 -> 17
  - Categories!C21: 10 -> 11

Computed values that change are counts over the whole catalog (systems per category, systems producing or using a resource) and the flags computed from those counts (a category's "Within target?"); none of them is a flow quantity, a cost, or a checklist result.
