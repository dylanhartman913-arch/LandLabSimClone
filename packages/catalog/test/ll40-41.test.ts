import { describe, expect, it } from 'vitest';
import { catalog } from '../src/index.ts';
import { WaterInfrastructureSchema, type Overrides } from '../src/schema.ts';
import { realOverrides, realXlsx, tryExport } from './helpers.ts';

describe('LL-40/41 catalog expansion', () => {
  it('rejects missing infrastructure systems and invalid loss or labor multipliers', () => {
    const rule = catalog.waterInfrastructure!;
    for (const patch of [
      { springRadiusFt: 0 },
      { rainLossFraction: 1.1 },
      { filterLaborMultiplier: -1 },
      { grainRodentLossPerWeek: -1 },
    ])
      expect(WaterInfrastructureSchema.safeParse({ ...rule, ...patch }).success).toBe(false);
    expect(
      tryExport(realXlsx, {
        ...(realOverrides as Overrides),
        waterInfrastructure: { ...rule, springId: 'S999' },
      }).error?.message,
    ).toContain('Water infrastructure: unknown system S999');
  });
  it('ships workbook-backed systems with upkeep flows and the new canonical units', () => {
    const added = catalog.systems.filter((s) => Number(s.id.slice(1)) >= 179 && Number(s.id.slice(1)) <= 189);
    expect(added).toHaveLength(11);
    for (const system of added) {
      expect(system.provenance.costBuy).toBe('xlsx');
      expect(system.notes).toContain('game');
      expect(catalog.flows.find((f) => f.systemId === system.id && f.resource === 'Labor')!.qty).toEqual({
        kind: 'const',
        value: system.weeklyUpkeepHrs,
      });
    }
    expect(catalog.resources.find((r) => r.name === 'Cheese')).toMatchObject({
      unit: 'lbs',
      factorToNeed: 1800,
      spoilPerWeek: 0.01,
    });
    expect(catalog.resources.find((r) => r.name === 'Potable water storage')).toMatchObject({
      unit: 'gal',
      class: 'Capacity',
    });
    expect(catalog.resources.find((r) => r.name === 'Grain storage')).toMatchObject({
      unit: 'lbs',
      class: 'Capacity',
    });
  });
});
