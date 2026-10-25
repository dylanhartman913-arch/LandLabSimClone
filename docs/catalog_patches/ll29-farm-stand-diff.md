# Catalog patch `ll29-farm-stand`: verified workbook diff

Compared the final source workbook with `git show HEAD:data/source/LandLab_Sim_Systems_v2.xlsx` using openpyxl (formula view). Existing typed cells changed: **0**. Existing formulas extended for new system ranges: **895**.

| Sheet | Before rows | After rows | Added |
|---|---:|---:|---:|
| Systems | 178 | 179 | 1 |
| Flows | 820 | 822 | 2 |
| Matrix | 178 | 179 | 1 |

Added S178 Farm Stand, F0820 Labor (2 hours/week), F0821 Transportation (10 miles/week). Source patch: `data/catalog_patches/ll29-farm-stand.json`. Construction, labor, transport and prices are experimental game balance assumptions, marked low confidence. Numbers are not presented as researched local estimates.

The patch was applied with `scripts/catalog_patch.py` and recalculated in LibreOffice. The generated catalog and parity goldens were exported from the resulting workbook.
