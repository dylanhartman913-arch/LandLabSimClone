# LL-33 storage pools and winter water comparisons

Reproduce with `node --import tsx packages/cli/bots/storage.ts`. LL-33 remains an opt-in experimental setting; nothing here changes defaults. Quantities are game balance assumptions (see `docs/LL_33.md`), not household engineering forecasts.

## First-year routes

Two adults, greenfield remote-job tutorial policy, 365 days from the game start. Settings otherwise match current game defaults; ordinary supplies. Standard seed 1 and Real seeds 1–3 at each site. Quest progress can change later action dates.

| Site | Weather/seed | Variant | Survival short days | Min wellbeing | End cash | Drinking water spilled (gal) | Raw water spilled (gal) | Tank-days frozen | Most locked (gal) |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| front-range | standard/1 | legacy | 0 | 75.2 | 58050 | 33.3 | 360.9 | 0 | 0.0 |
| front-range | standard/1 | pools | 0 | 75.2 | 57929 | 208.6 | 0.0 | 58 | 53.5 |
| front-range | real/1 | legacy | 0 | 75.2 | 57700 | 31.5 | 420.0 | 0 | 0.0 |
| front-range | real/1 | pools | 0 | 75.2 | 57595 | 208.6 | 0.0 | 36 | 53.7 |
| front-range | real/2 | legacy | 0 | 75.2 | 57614 | 35.4 | 327.1 | 0 | 0.0 |
| front-range | real/2 | pools | 0 | 75.2 | 57499 | 208.6 | 0.0 | 66 | 53.6 |
| front-range | real/3 | legacy | 0 | 75.2 | 57027 | 35.2 | 329.6 | 0 | 0.0 |
| front-range | real/3 | pools | 0 | 75.2 | 56898 | 208.6 | 0.2 | 61 | 53.6 |
| laramie-wy | standard/1 | legacy | 0 | 75.2 | 57249 | 15.1 | 205.0 | 0 | 0.0 |
| laramie-wy | standard/1 | pools | 0 | 75.2 | 57120 | 208.6 | 0.0 | 152 | 53.5 |
| laramie-wy | real/1 | legacy | 0 | 75.2 | 57014 | 17.1 | 216.5 | 0 | 0.0 |
| laramie-wy | real/1 | pools | 0 | 75.2 | 56886 | 208.6 | 0.0 | 148 | 53.4 |
| laramie-wy | real/2 | legacy | 0 | 75.2 | 57081 | 16.7 | 193.0 | 0 | 0.0 |
| laramie-wy | real/2 | pools | 0 | 75.2 | 56934 | 208.6 | 0.0 | 153 | 53.6 |
| laramie-wy | real/3 | legacy | 0 | 75.2 | 56114 | 15.4 | 199.2 | 0 | 0.0 |
| laramie-wy | real/3 | pools | 0 | 75.2 | 55946 | 208.6 | 0.0 | 151 | 53.6 |
| asheville-nc | standard/1 | legacy | 0 | 75.2 | 59881 | 12.0 | 883.9 | 0 | 0.0 |
| asheville-nc | standard/1 | pools | 0 | 75.2 | 59859 | 208.6 | 0.0 | 0 | 0.0 |
| asheville-nc | real/1 | legacy | 0 | 75.2 | 59955 | 5.4 | 986.4 | 0 | 0.0 |
| asheville-nc | real/1 | pools | 0 | 75.2 | 59880 | 208.6 | 0.0 | 0 | 0.0 |
| asheville-nc | real/2 | legacy | 0 | 75.2 | 59926 | 15.5 | 829.5 | 0 | 0.0 |
| asheville-nc | real/2 | pools | 0 | 75.2 | 59912 | 208.6 | 0.0 | 0 | 0.0 |
| asheville-nc | real/3 | legacy | 0 | 75.2 | 59890 | 15.8 | 834.2 | 0 | 0.0 |
| asheville-nc | real/3 | pools | 0 | 75.2 | 59848 | 208.6 | 1.3 | 0 | 0.0 |

## Winter tank checks

One adult, a Bell Tent and an outdoor tank holding 80 gal of raw water to start, January 1 to April 30 (120 days), Standard weather. The heated variant adds a 1.5 kW wind turbine and a 10 kWh battery bank; the heater only draws electricity left after household use. Protection is bought on day 0 and installed with the household’s spare labor.

| Site | Tank | Protection | First freeze (day) | Days frozen | Most locked (gal) | Heater kWh | Heater kWh needed | Install hours |
|---|---|---|---:|---:|---:|---:|---:|---:|
| laramie-wy | Rain Barrel (55 gal) | none | 0 | 93 | 34.4 | 0.0 | 0.0 | 0.0 |
| laramie-wy | Rain Barrel (55 gal) | insulated | 3 | 100 | 12.9 | 0.0 | 0.0 | 2.0 |
| laramie-wy | Rain Barrel (55 gal) | heated | — | 0 | 0.0 | 27.7 | 27.7 | 1.0 |
| laramie-wy | IBC Tank (food grade) | none | 1 | 95 | 43.5 | 0.0 | 0.0 | 0.0 |
| laramie-wy | IBC Tank (food grade) | insulated | 7 | 110 | 0.0 | 0.0 | 0.0 | 2.0 |
| laramie-wy | IBC Tank (food grade) | heated | — | 0 | 0.0 | 138.6 | 138.6 | 1.0 |
| front-range | Rain Barrel (55 gal) | none | 8 | 30 | 0.0 | 0.0 | 0.0 | 0.0 |
| front-range | Rain Barrel (55 gal) | insulated | — | 0 | 0.0 | 0.0 | 0.0 | 2.0 |
| front-range | Rain Barrel (55 gal) | heated | — | 0 | 0.0 | 1.6 | 1.6 | 1.0 |
| front-range | IBC Tank (food grade) | none | 16 | 30 | 0.0 | 0.0 | 0.0 | 0.0 |
| front-range | IBC Tank (food grade) | insulated | — | 0 | 0.0 | 0.0 | 0.0 | 2.0 |
| front-range | IBC Tank (food grade) | heated | — | 0 | 0.0 | 8.1 | 8.1 | 1.0 |
| asheville-nc | Rain Barrel (55 gal) | none | — | 0 | 0.0 | 0.0 | 0.0 | 0.0 |
| asheville-nc | Rain Barrel (55 gal) | insulated | — | 0 | 0.0 | 0.0 | 0.0 | 2.0 |
| asheville-nc | Rain Barrel (55 gal) | heated | — | 0 | 0.0 | 0.0 | 0.0 | 1.0 |
| asheville-nc | IBC Tank (food grade) | none | — | 0 | 0.0 | 0.0 | 0.0 | 0.0 |
| asheville-nc | IBC Tank (food grade) | insulated | — | 0 | 0.0 | 0.0 | 0.0 | 2.0 |
| asheville-nc | IBC Tank (food grade) | heated | — | 0 | 0.0 | 0.0 | 0.0 | 1.0 |

## Feed storage checks

An order for 500 lb of hay and 100 lb of chicken feed on day 0, Front Range, no animals. Legacy pools store everything; LL-33 stores what fits in free Storage space plus 10 cu ft of household bins.

| Variant | Hay delivered (lb) | Chicken feed delivered (lb) | Spent ($) |
|---|---:|---:|---:|
| legacy | 500.0 | 100.0 | 110.00 |
| bins | 95.0 | 0.0 | 14.25 |
| shed | 500.0 | 100.0 | 110.00 |
