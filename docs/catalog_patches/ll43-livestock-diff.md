# Catalog patch `ll43-livestock`: xlsx diff summary

Four Upgrade Roadmap 2 livestock-lifecycle systems. Existing workbook numbers are unchanged. Reference quantities and game assumptions are distinguished in row notes.

## Rows added

| Sheet | Rows |
|---|---|
| Systems | 194, 195, 196, 197 |
| Flows | 857, 858, 859, 860, 861, 862 |
| Matrix | 194, 195, 196, 197 |
| Resources | (none) |

## Validation and highlighting extended

- Systems data validation (whole) R2:R193 -> R2:R197
- Matrix conditional formatting (3 rules) B2:BK193 -> B2:BK197

## Systems added

- **Egg Incubator (24 eggs)** (Livestock; Fowl): input Labor 0.1 Weekly
- **Broody Hen Nest Box** (Livestock; Fowl): input Labor 0.05 Weekly; input Waste lumber 10 One-time
- **Predator-Proof Run (12 birds)** (Livestock; Fowl): input Labor 0.25 Weekly; input Waste lumber 150 One-time
- **Rotational Paddock Kit** (Livestock; Land): input Labor 1 Weekly

## Existing cells

- Typed values (numbers and text) changed: **0** (the text edits above, if any; never a number)
- Formulas whose text changed (system/resource lookup ranges extended for new rows): **931**
- Computed values that changed after recalculation: **5**
  - Resources!G24: 170 -> 174
  - Resources!G41: 4 -> 6
  - Categories!C5: 13 -> 17
  - Categories!C16: 6 -> 9
  - Categories!C24: 10 -> 11

Computed values that change are counts over the whole catalog (systems per category, systems producing or using a resource) and the flags computed from those counts (a category's "Within target?"); none of them is a flow quantity, a cost, or a checklist result.
