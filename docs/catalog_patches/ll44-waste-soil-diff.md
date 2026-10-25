# Catalog patch `ll44-waste-soil`: xlsx diff summary

Five Upgrade Roadmap 2 waste, soil and sanitation systems. Existing workbook numbers are unchanged. Reference quantities and game assumptions are distinguished in row notes. Laundry Station is tagged Sanitation rather than Water-System, which is at its 20-system target.

## Rows added

| Sheet | Rows |
|---|---|
| Systems | 198, 199, 200, 201, 202 |
| Flows | 863, 864, 865, 866, 867, 868, 869, 870, 871, 872, 873, 874, 875, 876, 877, 878, 879 |
| Matrix | 198, 199, 200, 201, 202 |
| Resources | (none) |

## Validation and highlighting extended

- Systems data validation (whole) R2:R197 -> R2:R202
- Matrix conditional formatting (3 rules) B2:BK197 -> B2:BK202

## Systems added

- **Manure Windrow** (Compost): input Labor 1 Weekly; input Manure 30 Weekly; input Carbon 15 Weekly; input Water 10 Weekly; output Compost 25 Weekly
- **Leaf Litter Gathering** (Biomass; Compost): input Labor 1.5 Weekly; output Carbon 30 Weekly
- **Sawmill Sawdust Pickup** (Conventional; Compost): input Labor 0.25 Weekly; input Capital 6 Weekly; output Carbon 100 Weekly
- **Cover Crop Seeding** (Garden; Plants): input Labor 0.1 Weekly; input Seeds 2 Per season
- **Laundry Station** (Sanitation; Tools): input Labor 2 Weekly; input Water 30 Weekly; input Hot water 20 Weekly; output Wellbeing 5 Weekly; output Greywater 45 Weekly

## Existing cells

- Typed values (numbers and text) changed: **0** (the text edits above, if any; never a number)
- Formulas whose text changed (system/resource lookup ranges extended for new rows): **937**
- Computed values that changed after recalculation: **18**
  - Resources!G2: 54 -> 56
  - Resources!G4: 1 -> 2
  - Resources!F5: 2 -> 3
  - Resources!G24: 174 -> 179
  - Resources!G25: 21 -> 22
  - Resources!F44: 10 -> 12
  - Resources!G44: 11 -> 12
  - Resources!F45: 8 -> 9
  - Resources!G46: 2 -> 3
  - Resources!G54: 9 -> 10
  - Resources!F63: 36 -> 37
  - Categories!C4: 13 -> 14
  - Categories!C8: 14 -> 15
  - Categories!C10: 11 -> 14
  - Categories!C12: 14 -> 15
  - Categories!C13: 12 -> 13
  - Categories!C14: 8 -> 9
  - Categories!C20: 12 -> 13

Computed values that change are counts over the whole catalog (systems per category, systems producing or using a resource) and the flags computed from those counts (a category's "Within target?"); none of them is a flow quantity, a cost, or a checklist result.
