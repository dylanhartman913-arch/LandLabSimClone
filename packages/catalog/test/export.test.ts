import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CatalogSchema, GoldensSchema } from '../src/schema.ts';
import { GENERATED_DIR, exportFromFiles, renderGenerated } from '../src/exporter/index.ts';

const { catalog, goldens } = exportFromFiles();

describe('exporting the delivered spreadsheet', () => {
  it('finds 168 systems, 797 flows, and 62 resources', () => {
    expect(catalog.systems).toHaveLength(168);
    expect(catalog.flows).toHaveLength(797);
    expect(catalog.resources).toHaveLength(62);
  });

  it('keeps the 24 dropdown categories plus the hidden Household category', () => {
    expect(catalog.categories.filter((c) => c.inDropdown)).toHaveLength(24);
    expect(catalog.categories.find((c) => c.name === 'Household')?.inDropdown).toBe(false);
  });

  it('maps every formula flow to a climate-linked QtyExpr', () => {
    const kinds = new Map<string, number>();
    for (const f of catalog.flows) kinds.set(f.qty.kind, (kinds.get(f.qty.kind) ?? 0) + 1);
    // 70 formula cells in Flows!E: 16 sun, 3 pv, 20 heat, 20 cool, 1 catch area, 5 rain, 3 rain capture, 1 wind, 1 hydro
    expect(Object.fromEntries(kinds)).toEqual({
      const: 727,
      sun: 16,
      pv: 3,
      heatLoad: 20,
      coolLoad: 20,
      catchArea: 1,
      rain: 5,
      rainCapture: 3,
      wind: 1,
      hydro: 1,
    });
  });

  it('reads the front-range assumptions', () => {
    expect(catalog.assumptions).toEqual({
      hdd: 6000,
      cdd: 800,
      psh: 5,
      pvDerate: 0.8,
      precipIn: 15,
      galPerSqftIn: 0.623,
      windCf: 0.15,
      hydroCf: 0.85,
      seasonsPerYear: 1,
    });
  });

  it('produces files that satisfy the zod schemas', () => {
    expect(() => CatalogSchema.parse(catalog)).not.toThrow();
    expect(() => GoldensSchema.parse(goldens)).not.toThrow();
  });

  it('matches the committed generated files (catalog:check)', () => {
    for (const [name, text] of Object.entries(renderGenerated({ catalog, goldens }))) {
      expect(readFileSync(join(GENERATED_DIR, name), 'utf8'), name).toBe(text);
    }
  });

  it('captures the starter design and its cached checklist as goldens', () => {
    expect(goldens.humans).toBe(1);
    expect(goldens.overallScore).toBeCloseTo(0.485, 3);
    expect(goldens.counts['S074']).toBe(1); // Human Being
    expect(goldens.checklist.find((r) => r.need === 'Heated shelter')?.needed).toBeCloseTo(697846.15, 1);
    expect(goldens.checklist.find((r) => r.need === 'Food')?.provided).toBeCloseTo(4978.85, 1);
  });
});

describe('engine-only default rules', () => {
  const sys = (name: string) => catalog.systems.find((s) => s.name === name)!;
  const flow = (id: string) => catalog.flows.find((f) => f.id === id)!;

  it('puts people first, animals second, everything else third', () => {
    expect(sys('Human Being').priorityTier).toBe(0);
    expect(sys('Chicken').priorityTier).toBe(1);
    expect(sys('Beehive + Bee Colony').priorityTier).toBe(1);
    expect(sys('Well').priorityTier).toBe(2);
  });

  it('gives trees five years to mature and a food forest seven', () => {
    expect(sys('Apple Tree').yearsToFullOutput).toBe(5);
    expect(sys('Permaculture Food Forest (1/4 acre)').yearsToFullOutput).toBe(7);
    expect(sys('Coppice Woodlot (1/4 acre)').yearsToFullOutput).toBe(3);
    expect(sys('Raised Beds (24 sq ft)').yearsToFullOutput).toBe(0);
  });

  it('treats pollination for raised beds as a 15% boost, not a hard requirement', () => {
    expect(flow('F0390')).toMatchObject({ resource: 'Pollination', inputRole: 'boost', boostWeight: 0.15 });
    expect(flow('F0390').provenance.inputRole).toBe('default-rule');
  });

  it('harvests apples in September-October and firewood in November', () => {
    expect(flow('F0626').timing).toEqual({ kind: 'window', startWeek: 34, endWeek: 43 });
    expect(flow('F0235').timing).toEqual({ kind: 'window', startWeek: 44, endWeek: 48 });
    expect(flow('F0391').timing).toEqual({ kind: 'growing-season' });
  });

  it('stores water in tanks with a 50 gal buffer and spills unstored electricity', () => {
    const res = (n: string) => catalog.resources.find((r) => r.name === n)!;
    expect(res('Water').storedIn).toEqual({
      capacityResource: 'Water storage',
      buffer: 50,
      unitsPerCapacityUnit: 1,
    });
    expect(res('Electricity').storedIn?.buffer).toBe(0);
    expect(res('Eggs').storedIn?.capacityResource).toBe('Food storage');
    expect(res('Milk').spoilPerWeek).toBe(0.3);
  });

  it('records provenance for every xlsx value', () => {
    const s = sys('Yurt');
    expect(s.provenance.costBuy).toBe('xlsx');
    expect(s.provenance.priorityTier).toBe('default-rule');
    expect(s.spriteKey).toBe(`system:${s.id}`);
  });

  it('treats people’s inputs and shelter heating as needs that never switch a system off', () => {
    expect(flow('F0349')).toMatchObject({ resource: 'Food', inputRole: 'need' }); // Human Being
    expect(flow('F0353')).toMatchObject({ resource: 'Shelter', inputRole: 'capacity' });
    expect(flow('F0041')).toMatchObject({ resource: 'Heat', inputRole: 'need' }); // Bell Tent
  });

  it('shapes heating by degree-days and irrigation by the growing season', () => {
    expect(flow('F0328').timing).toEqual({ kind: 'heating' }); // Tiny Wood Stove heat
    expect(flow('F0327').timing).toEqual({ kind: 'steady' }); // …its wood (it also cooks)
    expect(
      catalog.flows.find((f) => f.systemId === sys('Raised Beds (24 sq ft)').id && f.resource === 'Water')!
        .timing,
    ).toEqual({ kind: 'growing-season' });
  });

  it('knows heat cannot be stored, solar can run daytime loads, and food can stand in for food', () => {
    const res = (n: string) => catalog.resources.find((r) => r.name === n)!;
    expect(res('Heat').storable).toBe(false);
    expect(res('Woody biomass').storable).toBe(true);
    expect(res('Electricity').directUseShare).toBe(0.5);
    expect(res('Food').satisfiedBy[0]).toBe('Fish'); // most perishable first
    expect(res('Food').satisfiedBy.at(-1)).toBe('Food');
  });

  it('lets coops sit on pasture: large plantings are a ground layer', () => {
    expect(sys('Pasture (1 acre)').layer).toBe('ground');
    expect(sys('Chicken Coop (12 hens)').layer).toBe('object');
    expect(sys('Human Being').layer).toBe('none');
  });

  it('applies the committed boost overrides with their notes', () => {
    expect(flow('F0366')).toMatchObject({ resource: 'Grubs', inputRole: 'boost', boostWeight: 0.1 });
    expect(flow('F0366').provenance.inputRole).toBe('override');
  });
});
