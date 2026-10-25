import { describe, expect, it } from 'vitest';
import { catalog } from '../src/index.ts';

const idOf = (name: string) => catalog.systems.find((s) => s.name === name)!.id;

describe('LL-45 heat, hot water and shelter efficiency catalog rows', () => {
  it('ships three workbook systems; heat-need cuts are host modifiers on the right shelters', () => {
    const liner = idOf('Canvas Tent Winter Liner');
    const draft = idOf('Draft-Proofing Kit (small shelter)');
    for (const id of [liner, idOf('Wood Boiler with Water Jacket'), draft])
      expect(catalog.systems.find((s) => s.id === id)!.provenance.costBuy).toBe('xlsx');
    expect(catalog.adjacencyRules.filter((r) => r.from === liner)).toEqual([
      expect.objectContaining({ to: 'category:Canvas', scope: 'host', effect: expect.objectContaining({ resource: 'Heat', multiplier: 0.75, direction: 'in' }) }),
    ]);
    const sealed = catalog.adjacencyRules.filter((r) => r.from === draft);
    const targets = new Set(sealed.map((r) => r.to));
    for (const id of targets) {
      const shelter = catalog.flows.find((f) => f.systemId === id && f.resource === 'Shelter' && f.direction === 'out')!;
      expect(shelter.qty.kind === 'const' && shelter.qty.value).toBeLessThanOrEqual(400);
      expect(catalog.systems.find((s) => s.id === id)!.categories).not.toContain('Canvas');
    }
    expect(sealed.map((r) => r.effect.resource).sort()).toEqual([...Array(targets.size).fill('Cooling'), ...Array(targets.size).fill('Heat')]);
  });
  it('fires the boiler year-round: wood steady, heat seasonal, hot water steady', () => {
    const id = idOf('Wood Boiler with Water Jacket');
    const timing = (r: string) => catalog.flows.find((f) => f.systemId === id && f.resource === r)!.timing.kind;
    expect([timing('Woody biomass'), timing('Heat'), timing('Hot water')]).toEqual(['steady', 'heating', 'steady']);
    expect(catalog.resources.find((r) => r.name === 'Hot water')!.note).toContain('Not a checklist row');
  });
});
