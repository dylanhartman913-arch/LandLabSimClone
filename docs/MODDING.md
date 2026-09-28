# Modding guide

Everything the game knows about systems, resources, and how they connect comes from one spreadsheet, `data/source/LandLab_Sim_Systems_v2.xlsx`, plus a small overrides file for engine-only behavior. Adding a system is a spreadsheet edit and one command; no code changes.

Field-by-field reference: [`CATALOG.md`](CATALOG.md). Engine behavior: [`ENGINE.md`](ENGINE.md).

## Add a system

You need Node 22, `npm ci` once, and a spreadsheet program that recalculates formulas (Excel, LibreOffice, Numbers). SheetJS reads the values the program saved, so always save after recalculating.

1. **Systems sheet: add a row.**
   - `System ID`: the next free ID (the shipped catalog ends at `S168`, so `S169`).
   - `System`: a unique name. This is what players see.
   - `Categories`: one or more names from the Categories sheet, separated by `; `. The first category sets the tile color and icon.
   - `Source`, `Description`, `Confidence` (`high`, `medium`, `low`), `Notes`: plain text.
   - `Purchase cost ($)`, `DIY cost ($)` (blank if you can't build it yourself), `Setup labor (hrs)`, `Weekly upkeep (hrs)`, `Footprint (sq ft)` (0 for things with no place on the map, like a job), `Lifespan (yrs)`.
   - Shelters: fill `Conditioned area` and `Heat-loss factor`. Rain collectors: `Catchment area` and `Capture efficiency`.
   - `Count in design`: 0.
   - Copy the formula cells (`Cheapest build`, `# Inputs`, `# Outputs`) down from the row above.
2. **Flows sheet: add one row per input and output.**
   - `Flow ID`: the next free ID (`F0798` onward).
   - `System`: the exact name from step 1.
   - `Direction`: `Input` or `Output`.
   - `Resource`: a name from the Resources sheet.
   - `Qty per period`, and `Period` (`Daily`, `Weekly`, `Monthly`, `Yearly`, `Per season`, `Capacity`, `One-time`).
   - Always include a `Labor` input of at least the weekly upkeep hours.
   - If the amount depends on the site's climate, use one of the formula templates in `CATALOG.md` (sun, rain, wind, heating and cooling loads, catchment); the exporter recognizes them and re-evaluates them for every site.
   - Copy the formula columns (`Unit`, `Weekly equivalent`, and the rest) down from the row above.
3. **Recalculate and save the workbook.**
4. **Export and check:**

   ```sh
   npm run catalog:export   # writes packages/catalog/generated/catalog.json and goldens.json
   npm test                 # parity, conservation, determinism, and the rest
   npm run dev              # your system is in the drawer
   ```

   The exporter stops on anything it can't make sense of and lists every problem it found, naming the sheet, row, and flow, for example `Flows row 812 (F0811): unknown resource "Hay bales"`.
5. **Commit** the workbook and the regenerated files together. CI fails if they disagree (`npm run catalog:check`).

The system gets sensible engine behavior from default rules: its allocation priority, how long plants take to mature, whether an input is required or only a boost, when in the year it produces. `CATALOG.md` lists the rules. `packages/catalog/test/modding.test.ts` and `apps/web/src/lib/modding.test.ts` do exactly these steps on a copy of the workbook (a solar food dehydrator) and check that the new system exports, shows in the drawer and search, gets a card, and runs in the engine.

## Tune engine behavior (optional)

`data/catalog_overrides.json` sets engine-only fields the spreadsheet has no column for. Each entry needs a note saying why.

```json
{
  "systems": { "S169": { "yearsToFullOutput": 0, "priorityTier": 2 } },
  "flows": { "F0799": { "inputRole": "boost", "boostWeight": 0.3, "note": "Works without it, better with it." } }
}
```

The same file holds the spatial rules: adjacency (shade, pollination, neighbors), roofs and paddocks that one consumer links to, and slope effects. Add a rule there to make your system care about where it sits. Run `npm run catalog:export` after any change.

Never put catalog numbers in code, and never hand-edit the generated JSON: both are overwritten by the next export, and parity tests compare the engine with the spreadsheet.

## Add a resource

Add a row to the Resources sheet before using it in a flow: its name, canonical unit (the engine never converts units), class (`Flow`, `Capacity`, `Ambient`, `Money`, `Service`), and, if it counts toward a need, the checklist row and the factor into that row's unit (70 kcal per egg, for example).

## Add a site

Copy a file in `data/sites/`, change its `id`, name, description, the scalar assumptions (degree-days, sun hours, precipitation, wind and hydro capacity factors), the twelve monthly shapes, the growing season, what the land has (a stream?), and the terrain (slope, stream position, existing trees as fractions of the parcel side). Register it in `packages/catalog/src/sites.ts`. The new-game window and every site menu pick it up.

## Art

Systems draw as original placeholder tiles: a rounded square in the first category's color with a glyph. `apps/web/src/sprites/manifest.json` maps a system's `spriteKey` (`system:<id>` unless an override sets one) to an image. The lookup (`manifestEntry`) exists, but drawing real images from it is not built yet (see the build log). Only add art you have the rights to; nothing may be copied from other games.

## Check a design from the command line

```sh
npm run sim -- balance designs/starter.json
npm run sim -- run designs/starter.json --site laramie-wy --years 3 --weather real --flow-record out.json --csv out.csv
npm run sim -- montecarlo designs/rain-fed-yurt.json --years 10 --seeds 200
```

A design file exported from the game (Plan → Export → Design file) includes every placement, so the command line sees the same shade and roof links as the game.
