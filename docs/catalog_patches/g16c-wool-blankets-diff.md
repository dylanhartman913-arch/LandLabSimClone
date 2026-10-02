# Catalog patch `g16c-wool-blankets`: xlsx diff summary

Wool Blankets & Sleeping Bags: bedding for a shelter's household, replacing the engine's hidden bedding constant (HEAT_BEDDING_HDD). Its effect (the host shelter's heat need x a multiplier) is an engine modifier in catalog_overrides.json, like the weatherization retrofit. Rows only.

## Rows added

| Sheet | Rows |
|---|---|
| Systems | 178 |
| Flows | 820 |
| Matrix | 178 |

## Validation and highlighting extended

- Systems data validation (whole) R2:R177 -> R2:R178
- Matrix conditional formatting (3 rules) B2:BK177 -> B2:BK178

## Systems added

- **Wool Blankets & Sleeping Bags** (Heating): input Labor 0.1 Weekly

## Existing cells

- Typed values (numbers and text) changed: **0** (the text edits above, if any; never a number)
- Formulas whose text changed (range ends extended to cover the new Systems rows): **894**
- Computed values that changed after recalculation: **2**
  - Resources!G24: 154 -> 155
  - Categories!C23: 12 -> 13

Computed values that change are counts over the whole catalog (systems per category, systems producing or using a resource) and the flags computed from those counts (a category's "Within target?"); none of them is a flow quantity, a cost, or a checklist result.
