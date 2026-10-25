import { describe, expect, it } from 'vitest';
import { catalog } from '../src/index.ts';
import { IncomeTradeRuleSchema, type Overrides } from '../src/schema.ts';
import { realOverrides, realXlsx, tryExport } from './helpers.ts';

describe('LL-46 income and trade catalog rules', () => {
  it('ships a growing-season CSA, a spinning wheel and a sellable woolen goods resource', () => {
    const r = catalog.incomeTrade!;
    const [csa, spin] = [r.csaId, r.spinningId].map((id) => catalog.systems.find((s) => s.id === id)!);
    expect([csa!.name, spin!.name]).toEqual(['CSA Share Program (4 half shares)', 'Spinning Wheel and Loom']);
    for (const s of [csa!, spin!]) expect(s.provenance.costBuy).toBe('xlsx');
    for (const f of catalog.flows.filter((f) => f.systemId === r.csaId)) expect(f.timing.kind).toBe('growing-season');
    expect(catalog.resources.find((x) => x.name === 'Woolen goods')).toMatchObject({
      unit: 'lbs', class: 'Flow', storable: true, marketPrice: 25, marketAvailable: false,
    });
    const wool = catalog.flows.filter((f) => f.resource === 'Wool' && f.direction === 'in');
    expect(wool.map((f) => f.systemId)).toEqual([r.spinningId]);
  });
  it('validates the rule and its required flows', () => {
    const r = catalog.incomeTrade!;
    expect(IncomeTradeRuleSchema.safeParse({ ...r, laborBarterValuePerHour: 0 }).success).toBe(false);
    expect(IncomeTradeRuleSchema.safeParse({ ...r, makeGoodFactor: 3 }).success).toBe(false);
    for (const [patch, problem] of [
      [{ csaId: 'S999' }, 'Income rule: unknown system S999'],
      [{ spinningId: 'S205' }, 'must have in Wool'],
      [{ csaId: 'S206' }, 'must have out Capital'],
    ] as const)
      expect(tryExport(realXlsx, { ...(realOverrides as Overrides), incomeTrade: { ...r, ...patch } }).error?.message).toContain(problem);
  });
});
