# LL-44 waste, soil and sanitation comparisons

Reproduce with `node --import tsx packages/cli/bots/waste-soil.ts`. Controlled equipment checks, not survival-route claims: household food, water and cash supplied, wellbeing drift disabled, Standard weather, seed 1, January 1–December 31. No defaults change.

## Manure to compost

A 12-hen coop (18 lb manure/week) with a windrow and sawdust for carbon. The coop’s feed, greens and grubs are stocked for the year. Every fixture has a municipal water hookup so water never limits.

| Site | Windrow | Manure made (lb) | Manure used (lb) | Carbon used by windrow (lb) | Compost made (lb) | Windrow labor (h) |
|---|---|---:|---:|---:|---:|---:|
| front-range | no | 926 | 0 | 0 | 0 | 0.0 |
| front-range | yes | 926 | 924 | 462 | 770 | 30.8 |
| laramie-wy | no | 926 | 0 | 0 | 0 | 0.0 |
| laramie-wy | yes | 926 | 924 | 462 | 770 | 30.8 |
| asheville-nc | no | 926 | 0 | 0 | 0 | 0.0 |
| asheville-nc | yes | 926 | 924 | 462 | 770 | 30.8 |

Inputs are the windrow’s own realized daily draws. The 18 lb/week coop supplies 60% of its 30 lb manure input, so it runs at that share.

## Carbon for a composting outhouse

One adult, a composting outhouse and no starting carbon. Sanitation met is delivered ÷ needed over the year.

| Site | Carbon source | Sanitation met | Carbon made (lb) | Source labor (h) | Source cash ($) |
|---|---|---:|---:|---:|---:|
| front-range | none | 0.0% | 0 | 0.0 | 0 |
| front-range | Leaf Litter Gathering | 94.6% | 1564 | 78.2 | 0 |
| front-range | Sawmill Sawdust Pickup | 94.6% | 5214 | 13.0 | 313 |
| laramie-wy | none | 0.0% | 0 | 0.0 | 0 |
| laramie-wy | Leaf Litter Gathering | 93.6% | 1564 | 78.2 | 0 |
| laramie-wy | Sawmill Sawdust Pickup | 93.6% | 5214 | 13.0 | 313 |
| asheville-nc | none | 0.0% | 0 | 0.0 | 0 |
| asheville-nc | Leaf Litter Gathering | 95.6% | 1564 | 78.2 | 0 |
| asheville-nc | Sawmill Sawdust Pickup | 95.6% | 5214 | 13.0 | 313 |

Without a source the outhouse never runs. Either source restores it to the same level; the remaining gap is the outhouse’s existing organic-waste timing, not carbon.

## Off-season cover crop on a tired bed

Soil fertility on. One raised bed starting at fertility 0.5 with no compost, with and without a seeding kit beside it, January 1–December 31. The kit has no sowing from a previous year, so it sows in late summer and only the November–December rest days gain this year.

| Site | Seeding kit | Fertility Dec 31 | Fertility added by cover crop | Vegetables (lb) | Seeds used (oz) |
|---|---|---:|---:|---:|---:|
| front-range | no | 0.298 | 0.000 | 6.4 | 0.10 |
| front-range | yes | 0.359 | 0.061 | 6.4 | 2.11 |
| laramie-wy | no | 0.298 | 0.000 | 6.4 | 0.10 |
| laramie-wy | yes | 0.354 | 0.056 | 6.4 | 2.11 |
| asheville-nc | no | 0.298 | 0.000 | 6.4 | 0.10 |
| asheville-nc | yes | 0.358 | 0.060 | 6.4 | 2.11 |

## Laundry station

One adult, a laundry station and a solar hot water heater, one year.

| Site | Hot water to laundry (gal) | Greywater from laundry (gal) | Laundry wellbeing (points) | Laundry labor (h) |
|---|---:|---:|---:|---:|
| front-range | 1040 | 2340 | 260 | 104.0 |
| laramie-wy | 1040 | 2340 | 260 | 104.0 |
| asheville-nc | 1040 | 2340 | 260 | 104.0 |

Limits: leaf litter and sawdust arrive evenly through the year; the windrow has no pile temperature or curing time; the seeding kit has no species, termination date or nitrogen accounting; laundry soap and drying are abstracted. Quantities are experimental balance; scope is in `LL_44.md`.
