# Catalog patch `g16b-table-formats`: xlsx diff summary

Extend the Systems column R data validation (whole number >= 0) and the Matrix IN/OUT/I/O highlighting to every row, including the G15 rows 170-177. They stopped at row 169. Formats only; no values change.

## Rows added

| Sheet | Rows |
|---|---|
| Systems | (none) |
| Flows | (none) |
| Matrix | (none) |

## Validation and highlighting extended

- Systems data validation (whole) R2:R169 -> R2:R177
- Matrix conditional formatting (3 rules) B2:BK169 -> B2:BK177

## Systems added

(none)

## Existing cells

- Typed values (numbers and text) changed: **0** (the text edits above, if any; never a number)
- Formulas whose text changed (range ends extended to cover the new Systems rows): **0**
- Computed values that changed after recalculation: **0**

Computed values that change are counts over the whole catalog (systems per category, systems producing or using a resource) and the flags computed from those counts (a category's "Within target?"); none of them is a flow quantity, a cost, or a checklist result.
