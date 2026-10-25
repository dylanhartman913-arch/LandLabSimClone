import { describe, expect, it } from 'vitest';
import { catalog } from '../src/index.ts';
import { FodderRuleSchema, type Overrides } from '../src/schema.ts';
import { realOverrides, realXlsx, tryExport } from './helpers.ts';

describe('LL-42 fodder catalog rules', () => {
  it('rejects invalid rainfall policy and systems without the required feed or tool flows', () => {
    const r = catalog.fodder!;
    for (const patch of [{ rainReferenceIn: 0 }, { droughtFloor: -1 }, { droughtFloor: 1.1 }])
      expect(FodderRuleSchema.safeParse({ ...r, ...patch }).success).toBe(false);
    for (const [patch, problem] of [
      [{ meadowId: 'S999' }, 'Fodder rule: unknown system S999'],
      [{ mixId: 'S074' }, 'must have out Chicken feed'],
      [{ barnId: 'S074' }, 'must have out Feed storage'],
      [{ scytheId: 'S151' }, 'scythe must have a fuel-free green biomass tool rule'],
    ] as const)
      expect(
        tryExport(realXlsx, { ...(realOverrides as Overrides), fodder: { ...r, ...patch } }).error?.message,
      ).toContain(problem);
  });
  it('ships three workbook systems, canonical feed volume and a lossy pounds-to-pounds mix', () => {
    const r = catalog.fodder!;
    const systems = [r.meadowId, r.mixId, r.barnId].map((id) => catalog.systems.find((s) => s.id === id)!);
    expect(systems.map((s) => s.name)).toEqual(['Hay Meadow (1/10 acre)', 'Poultry Feed Mix', 'Hay Barn']);
    for (const s of systems) expect(s.provenance.costBuy).toBe('xlsx');
    expect(systems[0]!.layer).toBe('ground');
    expect(catalog.resources.find((res) => res.name === 'Feed storage')).toMatchObject({
      class: 'Capacity',
      unit: 'cu ft',
    });
    const inputs = catalog.flows.filter(
      (f) => f.systemId === r.mixId && f.direction === 'in' && f.resource !== 'Labor',
    );
    expect(inputs.map((f) => f.resource)).toEqual(['Grain', 'Green biomass', 'Grubs']);
    for (const f of inputs)
      expect(catalog.resources.find((res) => res.name === f.resource)!.unit).toBe('lbs');
    const mass = inputs.reduce((n, f) => n + (f.qty.kind === 'const' ? f.qty.value : 0), 0);
    const out = catalog.flows.find(
      (f) => f.systemId === r.mixId && f.direction === 'out' && f.resource === 'Chicken feed',
    )!;
    expect(mass).toBe(10);
    expect(out.qty).toEqual({ kind: 'const', value: 9 });
    const hay = catalog.flows.find((f) => f.systemId === r.meadowId && f.resource === 'Hay')!;
    expect(hay.timing.kind).toBe('growing-season');
  });
});
