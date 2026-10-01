# Catalog patch `g15`: xlsx diff summary

G15 catalog additions (HOMESTEAD_SIM_PLAYABILITY_ROADMAP.md, session G15, item 6). Rows only: no existing number changes.

## Rows added

| Sheet | Rows |
|---|---|
| Systems | 170, 171, 172, 173, 174, 175, 176, 177 |
| Flows | 799, 800, 801, 802, 803, 804, 805, 806, 807, 808, 809, 810, 811, 812, 813, 814, 815, 816, 817, 818, 819 |
| Matrix | 170, 171, 172, 173, 174, 175, 176, 177 |

## Systems added

- **Rain Barrel (55 gal)** (Water-System; Storage): input Labor 0.1 Weekly; input Rainfall (rain formula) Weekly; output Water (rainCapture formula) Weekly; output Water storage 55 Capacity
- **Pellet Mill (small)** (Biomass; Energy): input Labor 2 Weekly; input Wood chips 120 Weekly; input Electricity 15 Weekly; output Wood pellets 100 Weekly
- **Part-Time Job (20 hrs)** (Conventional): input Labor 20 Weekly; input Transportation 75 Weekly; output Capital 575 Weekly
- **Remote Job (40 hrs)** (Conventional): input Labor 40 Weekly; output Capital 1000 Weekly
- **Sheet-Mulch Lawn Conversion (500 sq ft)** (Garden): input Labor 0.25 Weekly; input Carbon 100 One-time; input Compost 200 One-time; output Soil 40 Per season
- **Home Weatherization Retrofit** (Shelter; Heating): input Labor 0.05 Weekly
- **Suburban Lot (1/4 acre)** (Land): output Land area 10890 Capacity
- **Clothesline** (Tools): input Labor 0.5 Weekly; output Wellbeing 2 Weekly

## Existing cells

- Typed values (numbers and text) changed: **0**
- Formulas whose text changed (range ends extended to cover the new Systems rows): **872**
- Computed values that changed after recalculation: **25**
  - Resources!F2: 9 -> 10
  - Resources!G19: 26 -> 27
  - Resources!G20: 6 -> 7
  - Resources!G24: 147 -> 154
  - Resources!F25: 1 -> 3
  - Resources!G27: 4 -> 5
  - Resources!F31: 5 -> 6
  - Resources!F35: 2 -> 3
  - Resources!G39: 1 -> 2
  - Resources!F40: 1 -> 2
  - Resources!G44: 10 -> 11
  - Resources!G45: 7 -> 8
  - Resources!F56: 3 -> 4
  - Resources!F63: 35 -> 36
  - Categories!C2: 17 -> 18
  - Categories!C3: 20 -> 21
  - Categories!E3: 'Yes' -> 'No'
  - Categories!C4: 12 -> 13
  - Categories!C7: 14 -> 15
  - Categories!C8: 12 -> 14
  - Categories!C13: 11 -> 12
  - Categories!C15: 10 -> 11
  - Categories!C20: 10 -> 11
  - Categories!C23: 11 -> 12
  - Categories!C24: 8 -> 9

Computed values that change are counts over the whole catalog (systems per category, systems producing or using a resource); none of them is a flow quantity, a cost, or a checklist result.
