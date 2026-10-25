# Catalog patch `ll30-preserved-food`: xlsx diff summary

Preserved food is measured in kcal. Conversion yields and batch rates live in engine-only overrides, gated by foodPreservation. Existing resource/flow quantities unchanged.

## Rows added

| Sheet | Rows |
|---|---|
| Systems | (none) |
| Flows | (none) |
| Matrix | (none) |
| Resources | 64 |

## Systems added

(none)

## Existing cells

- Typed values (numbers and text) changed: **0** (the text edits above, if any; never a number)
- Formulas whose text changed (system/resource lookup ranges extended for new rows): **2464**
- Computed values that changed after recalculation: **0**

Computed values that change are counts over the whole catalog (systems per category, systems producing or using a resource) and the flags computed from those counts (a category's "Within target?"); none of them is a flow quantity, a cost, or a checklist result.
