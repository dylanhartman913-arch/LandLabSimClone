# Phase 9: LL-30 and LL-31

Implemented October 24, 2026, engine **0.11.0**. These follow LL-28/LL-29. Both remain **opt-in** in Settings → Experimental mechanics; new games and continued saves do not enable them automatically. [Measured comparisons](PHASE_9B_COMPARISONS.md) cover all three sites before any default change.

## LL-30: food preservation chain

`Preserved food` is a separate Food-family Flow in **kcal**, with a factor of one and a low weekly spoilage rate. The resource was appended to the source workbook through `scripts/catalog_patch.py`, which now supports resource rows as well as system rows. Existing typed cells and cached numeric results are unchanged; [the patch report](catalog_patches/ll30-preserved-food-diff.md) records the resource lookup-range extensions. The catalog and spreadsheet parity goldens were regenerated from the workbook.

An installed **Pressure Canner** or **Solar Dehydrator** has a standing processing rule on its system card: choose an eligible fresh resource and a reserve to keep fresh. Household and system consumption run first. Processing then uses food above that reserve and the planting reserve, actual spare household labor, and fuel or sunlight. Unavailable inputs pause the rule. Today's harvest and culling yields can enter processing before storage or spoilage. The player can update or stop the rule.

Recipes are engine-only catalog overrides, with input resources, daily input-kcal ceiling, yield, labor and energy quantities. The current experimental recipes retain **90%** of input calories. The canner can process up to 12,000 input kcal/day, using an additional 0.5 labor hours and 0.2 Cooking fuel hours per 1,000 input kcal. The solar dryer can process up to 6,000 input kcal/day, using an additional 0.3 labor hours and 0.5 sun hours per 1,000 input kcal. These are explicit game balance assumptions, additional to the systems' catalog upkeep, not real processing or food-safety instructions. Wear and actual operating satisfaction can further reduce batch capacity.

**Root cellars and powered freezers protect fresh stock.** They do not turn food into permanently shelf-stable calories. Under this gate, Food storage capacity follows realized operation: an unpowered freezer supplies no cold-storage capacity. Fresh food retains its own spoilage rate; preserved food has its own much lower rate. Both occupy the shared Food storage pool and can spill when there is insufficient room.

Food-family allocation can feed people from preserved calories. Ledger `processed` amounts are separate from food eaten; preserved outputs are tagged `converted`. Daily processing records contain input units/kcal, output kcal, labor and energy. Food-production exports exclude converted output from new-harvest totals, avoiding double-counting harvest as well as its preserved form. Resource pages show processing sources, fresh-food consumers and buildable processors, using actual batch receipts rather than inventing nominal workbook flows. Gross resource production and every stock withdrawal remain conserved.

## LL-31: livestock lifecycle

Configured animal cohorts store chronological age and fed growth days. New adult purchases begin at maturity; newborns and chick batches start young. Shortages delay growth and breeding progress while chronological age continues. Productive output falls after prime age and ends at maximum age; manure remains a by-product while animals are alive. Old age emits a death event and removes the cohort without meat or a purchase refund.

A fed **Baby Chicks** batch matures after 55 growth days into a cohort of **12 Chickens**, preserving its instance identity and original paid cost. The cohort's inputs, outputs, tutorial counts and resource views use its scale. The map sprite and any open card follow the system change. This is a cohort in its existing enclosure, not twelve new map objects.

Hens, ducks and quail lay less as daylight shortens. The multiplier uses approximate astronomical day length at the site's latitude, independent of cloud/weather draws. Age and maturity factors apply to eggs, milk, wool, transport and other useful animal outputs. Colonies use a colony-scale age/split rule; individual bees and insect-farm populations are not simulated.

The card has explicit **Breed / hatch**, **Queue culling**, and **Cancel animal work** controls:

- Breeding books an outside breeding/fertile-stock service, pays its fee once, and queues actual household work. Birth/hatching waits for the configured fed days, required labor, and a valid location on the parcel. Offspring start immature, with new IDs and zero purchase/refund value. A blocked birth waits without allocating duplicate IDs. Catalog cohorts abstract sex and mating pairs; no new rooster/incubator system is introduced here.
- Culling uses household labor and removes the cohort when work completes. Dressed meat arrives once, in a ledger/event, scaled by cohort size and maturity. The catalog's steady Meat flows are suppressed only under this gate. Neither ordinary meat production nor a removal refund continues after culling.
- Fees and worked hours remain sunk on cancellation. Partial work and pending births survive saving.

Lifecycle, breeding, culling, cohort sizes and risk quantities live in validated engine-only catalog overrides. They are experimental game balance assumptions; existing workbook meat-flow quantities still define the unchanged balance-mode potential contract. Livestock, housing, colonies and equipment have distinct rules rather than treating every Livestock-category catalog row as an animal.

### Predator warnings and defenses

A seeded periodic draw can warn of predator tracks near vulnerable flocks. The warning precedes an attack by three enabled game days. An operating secure coop/hutch or a fed, staffed guardian within 100 feet prevents the loss. A failed or distant guardian does not protect animals. An unprotected attack removes one head from the cohort and produces no meat. Housing must also be operating to count as protection.

The card shows protection and the countdown. Events appear in toasts and the Almanac's Animals filter, with map links while the cohort exists. The existing hardship auto-pause preference also pauses on predator warnings; its label now states that behavior.

Predator draws use their own saved `livestockRng` stream. They cannot shift the climate RNG or change next year's weather in a paired comparison. Turning lifecycle off freezes age, work, warnings and risk draws; it restores the legacy output policy until re-enabled. Cohort size and scaled production remain intact while aging is paused. This gate is a simulator experiment, not an irreversible conversion of an old save.

## Controlled results

The report contains 48 first-year policy runs: three sites, Standard seed 1 and Real seeds 1–3, with baseline, preservation, lifecycle and both. Every variant has the same purchased dryer and tutorial/remote-job policy; real weather remains paired across the gates. All runs have zero survival-short days. The route produces no surplus above its seven-household-day fresh reserve, so preservation makes no batches in that route; this does not establish a benefit for every early purchase. Lifecycle reduces egg supply and changes later costs/quest timing without causing a first-year departure in these runs.

Focused checks exercise what that route does not:

- A matched 450,000-kcal harvest over 120 days ends with **62,480 kcal** under drying and **zero** when held fresh. Holding fresh has three days below 60% of food need; drying has none. Processing uses about 73.7 hours. The fixture isolates food stocks and does not claim all other household needs are met.
- With ordinary stored feed, water and labor, a chick batch becomes 12 hens; without feed it remains immature. The growth comparison disables predators to isolate feeding.
- With validation supply to isolate protection, the same warned hen survives with a nearby guardian and is lost when that guardian is out of range.
- A rabbit breeding order produces no offspring on day 30, then a new immature trio on day 31 after the $15 service and two hours of work. Culling takes two hours, removes the existing trio and yields 12 lb once.

No balance defaults were changed from these experiments. Freezer-specific frozen inventory/thawing, detailed sex/genetics, animal disease, new incubators and predator-proof-run catalog rows remain outside these two tickets.

## Verification

Sixteen focused engine tests cover calorie/resource/labor conservation, input limits and reserves, low spoilage, actual freezer operation, chick counts and tutorial credit, aging, seasonal laying, paid breeding, birth-space blocking, culling, predator timing/defenses, purity, save replay and climate-RNG independence. Four catalog tests reject invalid food conversions, units, offspring rules/ages and duplicate recipes. Three browser tests cover the processing rule/result, animal actions/events, and an open card following chick maturation. Screenshots in `docs/screenshots/phase-9b/` were visually inspected.
