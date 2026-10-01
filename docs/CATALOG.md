# Catalog

The catalog is every system, flow, resource, category, and assumption the game knows about. Its single source of truth is `data/source/LandLab_Sim_Systems_v2.xlsx`. The exporter (`packages/catalog/src/exporter`) reads the workbook, validates it, merges engine-only fields, and writes two committed files:

| File | Contents |
|---|---|
| `packages/catalog/generated/catalog.json` | Effective catalog: assumptions, periods, categories, resources, systems, flows, adjacency rules. Every record has a `provenance` map (`xlsx`, `override`, or `default-rule`) for each of its fields. |
| `packages/catalog/generated/goldens.json` | Cached spreadsheet values for the design saved in the xlsx (the "Count in design" column): Needs Checklist, overall score, Design Summary, Resources balance, and per-flow quantities. This is the parity contract for balance mode. |

```sh
npm run catalog:export   # regenerate after editing the xlsx or the overrides
npm run catalog:check    # CI: fails if the committed files differ from a fresh export
```

Never edit numbers in the generated JSON or in code. Fix the spreadsheet and re-export.

## Sheets read

| Sheet | Used for |
|---|---|
| README, Matrix | Must exist. Matrix is derived from Flows, so it carries no data the exporter needs. |
| Needs Checklist | Goldens: humans (B2), overall score (B3), rows 6-16 (provided, needed, %, covered). |
| Design Summary | Goldens: every metric row, mapped by its label to a key (see `SUMMARY_LABELS` in `export.ts`). |
| Systems | Systems. |
| Flows | Flows, and per-flow goldens (cached qty, weekly equivalent, count, weekly total, contribution to need). |
| Resources | Resources, and the Resources balance goldens (columns I-L). |
| Categories | Categories (name, in dropdown, target range, notes). |
| Assumptions | Scalar assumptions (rows by label) and the period table. |

Columns are found by header text, not position; a missing header fails the export.

## Resources

| Field | Source |
|---|---|
| `name` | Resources!A |
| `unit` | Resources!B. The one canonical unit for this resource. |
| `class` | Resources!C: `Flow`, `Capacity`, `Ambient`, `Service`, or `Money` |
| `needsRow` | Resources!D, one of the 11 checklist rows, if this resource feeds one |
| `factorToNeed` | Resources!E, the multiplier into the checklist row's unit (e.g. Eggs → 70 kcal) |
| `note` | Resources!M |
| `spoilPerWeek` | default rule / override |
| `storedIn` | default rule / override |
| `storable` | default rule / override |
| `directUseShare` | default rule / override |
| `satisfiedBy` | default rule / override |

## Systems

| Field | Source |
|---|---|
| `id`, `name` | Systems!A, B |
| `categories` | Systems!C, split on `;`. Each must exist on the Categories sheet. |
| `originalTags` | Systems!D |
| `source`, `description` | Systems!E, F |
| `costBuy`, `costDiy` | Systems!G, H (DIY is absent when the game offers no DIY route) |
| `setupLaborHrs`, `weeklyUpkeepHrs` | Systems!J, K |
| `footprintSqft`, `lifespanYrs` | Systems!L, M |
| `conditionedAreaSqft`, `heatLossFactor` | Systems!N, O (shelters) |
| `catchmentSqft`, `captureEff` | Systems!P, Q (rain catchment) |
| `starterCount` | Systems!R, "Count in design" |
| `gameListedInputs`, `gameListedOutputs` | Systems!U, V |
| `confidence`, `notes` | Systems!W, X |
| `priorityTier`, `yearsToFullOutput`, `spriteKey`, `layer` | default rule / override |

Systems!I (cheapest build), S and T (input/output counts) are formulas derived from other columns and are not exported.

## Flows

| Field | Source |
|---|---|
| `id` | Flows!A |
| `systemId` | Flows!B (system name) resolved to its ID |
| `direction` | Flows!C: `Input` → `in`, `Output` → `out` |
| `resource` | Flows!D, must be a Resources row |
| `qty` | Flows!E as a `QtyExpr` (below) |
| `period` | Flows!G: `Daily`, `Weekly`, `Monthly`, `Per season`, `Yearly`, `One-time`, `Capacity` |
| `note` | Flows!N |
| `inputRole`, `boostWeight`, `timing` | default rule / override |

### Quantity expressions

A typed number becomes `{ kind: 'const', value }`. A formula must match one of these templates (whitespace ignored; `$B<row>` must be the flow's own row; assumption cells are resolved by their label, so moving a row on Assumptions is safe):

| Kind | Formula shape | Meaning |
|---|---|---|
| `sun` | `Assumptions!psh*7` | sun-hours per week |
| `rain` | `Assumptions!precip/52` | inches per week |
| `pv` | `kw*Assumptions!psh*7*Assumptions!pvDerate` | kWh per week |
| `wind` | `kw*168*Assumptions!windCf` | kWh per week |
| `hydro` | `kw*168*Assumptions!hydroCf` | kWh per week |
| `catchArea` | `INDEX(Systems!P…,MATCH($B<row>,…))` | sq ft of roof (capacity) |
| `rainCapture` | `P*Assumptions!precip/52*Assumptions!gal*Q` | gal per week |
| `heatLoad` | `N*O*Assumptions!hdd*24/52` | BTU per week |
| `coolLoad` | `N*O*Assumptions!cdd*24/52` | BTU per week |

Anything else fails the export with the flow ID and the formula text; the exporter never falls back to the cached value. It also evaluates every expression and fails if the result differs from the cached cell value by more than 1e-9 relative. `evalQtyExpr` in `packages/catalog/src/qty.ts` evaluates in the same left-to-right order as Excel.

### Periods

From Assumptions rows 17-23. Weekly factor = times per year ÷ 52; `Per season` reads *Growing seasons per year*; `One-time` is 0 (setup material, counted at construction); `Capacity` is 1 (a stock, compared one-to-one).

## Validation (any failure stops the export)

- Unknown resource or system in a flow; unknown direction or period.
- Period incompatible with class: Capacity resources must use `Capacity`; Flow, Ambient, and Money resources must not. Service resources may use either (pollination is a capacity-like service; wellbeing is weekly).
- Duplicate system names or IDs; duplicate flow IDs or resource names.
- A category not on the Categories sheet.
- Negative quantities or numeric system fields.
- A system whose weekly upkeep (Systems!K) exceeds the weekly equivalent of its Labor input flows.
- A flow's unit that disagrees with its resource's unit.
- An unknown checklist row; a checklist resource with no factor.
- Overrides that name unknown systems, resources, flows, or adjacency endpoints, or that try to set anything other than engine-only fields.

All problems are collected and reported together.

## Engine-only fields and their default rules

Defaults live in `packages/catalog/src/exporter/defaults.ts`. Anything in `data/catalog_overrides.json` wins, and the record's `provenance` says which applied.

| Field | Default rule |
|---|---|
| `flow.inputRole` (inputs only) | Capacity class → `capacity`; Human Being inputs and shelter Heat/Cooling inputs → `need` (consumed and tracked, never curtails output: an unheated tent is still a tent); Labor → `required`; Service → `boost` with `boostWeight` 0.15; Ambient → `ambient`; everything else (including Capital) → `required` |
| `system.priorityTier` | Human Being 0; any of Livestock / Fowl / Insects 1; everything else 2 |
| `system.yearsToFullOutput` | Food forest 7; coppice 3; a Plants or Biomass system named *tree*, *bush*, or *hedgerow* 5; everything else 0 |
| `flow.timing` | Yearly outputs are harvest windows: wood weeks 44-48, honey 30-35, everything else weeks 34-43 (Sept-Oct). Yearly inputs (orchard compost) weeks 12-16. Per-season flows spread over the site's growing season. Heat outputs follow heating degree-days and Cooling outputs cooling degree-days; fuel for heating-only systems (category Heating, not Cooking) follows HDD and power for cooling-only systems follows CDD. Weekly irrigation (Water inputs) and weekly food yields of Garden and Plants systems happen only in the growing season (greenhouses and cold frames excepted). Everything else steady. Climate-linked quantity kinds (heat load, PV, rain…) take their shape from the kind. Every shape keeps the annual total. |
| `resource.storable` | False for Heat, Cooling, Cooking fuel, Transportation, Sanitation, Labor (services: unused supply is lost at day end); true for other Flow resources |
| `resource.directUseShare` | Electricity 0.5 (daytime loads can run straight off panels); others 0 |
| `resource.satisfiedBy` | Food (kcal) ← every food-family resource, most perishable first, then Food itself; others none |
| `system.layer` | No footprint → `none`; footprint ≥ 1,000 sq ft in Land, Biomass, Plants, Biodiversity, Garden, or Food System → `ground` (other systems may sit on it); else `object` |
| `resource.spoilPerWeek` | Vegetables 0.10, Eggs 0.03, Milk 0.30, Meat 0.20, Fish 0.30, Mushrooms 0.25, Root crops 0.02, Grain / Nuts / Honey 0.002; others 0 |
| `resource.storedIn` | Water, Drinking water → Water storage, 50 gal buffer. Electricity → Battery storage, no buffer (unstored surplus spills). Food family → Food storage, 10 cu ft pantry buffer, with packing densities (units per cu ft): Food 48,000 kcal, vegetables 20 lb, root crops 35 lb, grain 45 lb, eggs 120, honey 80 lb, meat 40 lb, milk 7.5 gal, fish 40 lb, nuts 35 lb, mushrooms 10 lb. The buffer belongs to the storage pool; when several resources share a pool the engine uses the largest buffer. |
| `system.spriteKey` | `system:<id>`; the web app generates a placeholder until art exists |
| `resource.deliversTo`, `resource.deliveryRadiusFt` | Heat → `shelter`, 10 ft; Cooling → `shelter`, 30 ft; everything else `any`, 0 (G11: heat and cooling only count when the producer reaches a shelter) |
| `system.outdoor` | false. Overrides set true for Firepit, Biochar Kiln Firepit, and Biochar Double Barrel Retort: their heat stays outdoors and never counts toward a shelter |
| `adjacencyRules` (catalog top level) | none by default; G7 adds rules through overrides |

### Overrides file

```json
{
  "version": 1,
  "systems":   { "S078": { "yearsToFullOutput": 0, "priorityTier": 2, "spriteKey": "raised-bed" } },
  "resources": { "Eggs": { "spoilPerWeek": 0.03, "storedIn": null } },
  "flows":     { "F0390": { "inputRole": "boost", "boostWeight": 0.2, "timing": { "kind": "steady" }, "note": "why" } },
  "adjacencyRules": []
}
```

Systems are keyed by ID, resources by name, flows by ID. Unknown keys and non-engine fields are rejected.

The committed overrides turn clearly supplementary inputs into boosts, each with a `note`: fowl greens, grubs, scraps, and bedding; shed Storage space for bikes and tools; liquid fertilizer and biochar; coffee grounds for worms and larvae; fresh forage where hay is the staple. Without them one missing supplement would switch off a coop entirely under the Leontief rule.

## How to add a system

1. **Systems sheet:** add a row with a new ID (`S169`…), a unique name, categories from the Categories sheet, costs, labor, footprint, lifespan, confidence, and a count of 0. Fill N/O for a shelter, P/Q for a rain collector.
2. **Flows sheet:** add one row per input and output with a new flow ID, the system name, direction, resource (must exist on Resources), quantity, and period. Include a Labor input at least equal to the weekly upkeep. Use one of the formula templates above if the quantity depends on climate.
3. **Optional:** add engine-only overrides for the system or its flows in `data/catalog_overrides.json`.
4. Run `npm run catalog:export`, then `npm test`. Commit the xlsx and the regenerated files together. The system appears in the game's drawer with no code change.

To add a resource, add a Resources row (name, unit, class, checklist row and factor if it feeds one) before using it in a flow.

## Spatial rules (G7)

All spatial behavior is data in `data/catalog_overrides.json`, exported to the catalog's top level.

**`adjacencyRules`**: `{ from, to, radiusFt, effect: { resource, multiplier, floor?, mode: 'scale' | 'require', direction: 'in' | 'out', stack: 'each' | 'once' }, note }`. `from` and `to` are a system ID, `category:<Category>`, or (for `from`) `terrain:tree`, the site's existing trees. Distances are edge to edge between footprints. Shipped rules:

| Rule | Effect |
|---|---|
| Hardwood, Oak, Poplar, Apple trees and existing trees within 30 ft of a Shelter | its Cooling need × 0.9 per tree, never below 0.7 |
| Beehive, Pollinators, Mason Bee House within 300 ft of Plants or Garden systems | Pollination only reaches systems with one in range (`require`) |
| Chicken or Chicken Coop within 20 ft of Compost Piles | Compost × 1.1 (once) |
| Trees within 150 ft of a Small Wind Turbine | Electricity × 0.7 (once) |

**`assignedCapacities`**: `{ resource, maxDistanceFt | null, note }`. Instead of pooling, each consumer is linked to one provider: the player's link if valid, otherwise the nearest provider with room. Shipped: Roofing area (rain catchment within 50 ft of a shelter's roof) and Fenced paddock (no distance limit).

**`terrainRules`**: `{ to, resource, direction, perSlopePct, min, max, note }`; multiplier = clamp(1 + perSlopePct × site slope %, min, max). Shipped: swales +4% water per percent of slope (to 1.5×); ponds −3% water and storage per percent (to 0.5×).


## Market prices and backstops (G12)

**Market prices are low confidence.** They are rough 2020s US retail figures, chosen so that growing your own is visibly cheaper than buying but buying is always possible. They live in `data/catalog_overrides.json` (`resources.<name>.marketPrice`, `marketUnit`). The exporter rejects a `marketUnit` that isn't `$/<the resource's unit>`.

| Resource | Price | Note |
|---|---|---|
| Food | $0.0065 / kcal | ~$90 per 14,000 kcal week |
| Drinking water | $1.00 / gal | bottled |
| Water | $0.10 / gal | hauled delivery |
| Woody biomass | $0.10 / lb | ~$350 per cord |
| Wood pellets | $0.30 / lb | bagged |
| Propane | $3.00 / gal | |
| Gasoline | $3.50 / gal | |
| Chicken feed | $0.35 / lb | |
| Hay | $0.15 / lb | |
| Carbon (straw) | $0.10 / lb | |
| Compost | $0.20 / lb | bagged |
| Soil | $1.50 / cu ft | bulk |
| Seeds | $3.00 / oz | |
| Seedlings | $4.00 / plant | |
| Waste lumber | $0.25 / lb | salvage yard |

**Proposal:** add `Market price` and `Market unit` columns to the Resources sheet of the xlsx, so prices live with the catalog and parity applies to them. Until then, they stay overrides.

**Backstops** (`systems.<id>.backstop`, `backstopFee`, `backstopPrices`):

| System | Fee / week | Prices |
|---|---|---|
| Big Box Grocery Store | 0 | Food at the market price |
| Factory Farmed Food (Family of Four) | 0 | Food at the market price |
| Central Power Plant | $3 | electricity $0.15/kWh, heat $0.000025/BTU ($2.50/therm), cooking $0.30/hour, cooling $0.000012/BTU |
| Municipal Water Hookup | $5 | water and drinking water $0.02/gal |
| Gas Station | 0 | gasoline at the market price |
| Farm & Feed Store | 0 | feed, hay, pellets, seeds, seedlings at market prices |

The default price rule is: an override, else the resource's market price, else the system's weekly Capital (less its fee) ÷ its first output. The exporter rejects a backstop that sells nothing, prices on outputs it doesn't have, and prices or a fee on a system that isn't a backstop. The grid and city-water prices reproduce roughly the catalog's own weekly bills at the catalog's output.
