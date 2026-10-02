# Catalog patch `g16a-retrofit-heating`: xlsx diff summary

Retag Home Weatherization Retrofit (S174) as Heating only. It modifies a shelter but isn't one, and the Shelter tag pushed the Shelter category to 21 systems (target 12-20). Text edit only; no number changes.

## Rows added

| Sheet | Rows |
|---|---|
| Systems | (none) |
| Flows | (none) |
| Matrix | (none) |

## Text edits

| System | Column | Was | Now | Why |
|---|---|---|---|---|
| Home Weatherization Retrofit | Categories | Shelter; Heating | Heating | It cuts a shelter's heat loss but gives no shelter; Shelter returns to 20 systems (target 12-20). |

## Systems added

(none)

## Existing cells

- Typed values (numbers and text) changed: **1** (the text edits above, if any; never a number)
  - Systems!C175: 'Shelter; Heating' -> 'Heating'
- Formulas whose text changed (range ends extended to cover the new Systems rows): **0**
- Computed values that changed after recalculation: **2**
  - Categories!C3: 21 -> 20
  - Categories!E3: 'No' -> 'Yes'

Computed values that change are counts over the whole catalog (systems per category, systems producing or using a resource) and the flags computed from those counts (a category's "Within target?"); none of them is a flow quantity, a cost, or a checklist result.
