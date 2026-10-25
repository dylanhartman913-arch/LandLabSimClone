import { describe, expect, it } from 'vitest';
import { catalog } from '../src/index.ts';
import { FertilityRuleSchema, type Overrides } from '../src/schema.ts';
import { realOverrides, realXlsx, tryExport } from './helpers.ts';

const flowsOf = (name: string) => {
  const id = catalog.systems.find((s) => s.name === name)!.id;
  return Object.fromEntries(
    catalog.flows
      .filter((f) => f.systemId === id)
      .map((f) => [`${f.direction} ${f.resource}`, f.qty.kind === 'const' ? f.qty.value : f.qty.kind]),
  );
};

describe('LL-44 waste, soil and sanitation catalog rows', () => {
  it('ships five workbook systems that close the manure, carbon, seeding and greywater gaps', () => {
    for (const name of ['Manure Windrow', 'Leaf Litter Gathering', 'Sawmill Sawdust Pickup', 'Cover Crop Seeding', 'Laundry Station'])
      expect(catalog.systems.find((s) => s.name === name)!.provenance.costBuy).toBe('xlsx');
    expect(flowsOf('Manure Windrow')).toEqual({ 'in Labor': 1, 'in Manure': 30, 'in Carbon': 15, 'in Water': 10, 'out Compost': 25 });
    expect(flowsOf('Sawmill Sawdust Pickup')).toEqual({ 'in Labor': 0.25, 'in Capital': 6, 'out Carbon': 100 });
    expect(flowsOf('Laundry Station')).toEqual({
      'in Labor': 2, 'in Water': 30, 'in Hot water': 20, 'out Wellbeing': 5, 'out Greywater': 45,
    });
    expect(catalog.systems.find((s) => s.name === 'Laundry Station')!.categories).not.toContain('Water-System');
    const manureUsers = new Set(catalog.flows.filter((f) => f.resource === 'Manure' && f.direction === 'in').map((f) => f.systemId));
    expect(manureUsers.size).toBe(3);
  });
  it('validates the seeding rule and requires it to take seeds', () => {
    const r = catalog.soilFertility!;
    expect(r.seeding!.systemId).toBe(catalog.systems.find((s) => s.name === 'Cover Crop Seeding')!.id);
    expect(FertilityRuleSchema.safeParse({ ...r, seeding: { ...r.seeding!, areaSqft: 0 } }).success).toBe(false);
    expect(
      tryExport(realXlsx, { ...(realOverrides as Overrides), soilFertility: { ...r, seeding: { ...r.seeding!, systemId: 'S197' } } })
        .error?.message,
    ).toContain('cover crop seeding S197 must take Seeds');
  });
});
