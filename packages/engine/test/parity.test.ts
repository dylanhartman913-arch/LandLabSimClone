import { catalog, goldens, NEED_KEYS } from '@homestead/catalog';
import { describe, expect, it } from 'vitest';
import { balancePotential, evalQty, getSystem, weeklyFactor } from '../src/index.ts';

/** Relative tolerance with an absolute floor of 1e-9 near zero. */
function expectClose(actual: number, expected: number, label: string) {
  const tol = 1e-9 * Math.max(1, Math.abs(expected));
  expect(Math.abs(actual - expected), `${label}: engine ${actual} vs sheet ${expected}`).toBeLessThanOrEqual(
    tol,
  );
}

const result = balancePotential(catalog, catalog.assumptions, { counts: goldens.counts });

describe('balancePotential mode reproduces the spreadsheet for the saved starter design', () => {
  it('evaluates every flow quantity and weekly equivalent like the sheet', () => {
    for (const flow of catalog.flows) {
      const g = goldens.flows[flow.id]!;
      const qty = evalQty(flow, getSystem(catalog, flow.systemId), catalog.assumptions);
      expectClose(qty, g.qty, `${flow.id} qty`);
      expectClose(
        qty * weeklyFactor(catalog, flow.period, catalog.assumptions),
        g.weeklyPerUnit,
        `${flow.id} weekly`,
      );
    }
  });

  it('matches every Needs Checklist row', () => {
    expect(result.checklist.map((r) => r.need)).toEqual(NEED_KEYS);
    for (const g of goldens.checklist) {
      const row = result.checklist.find((r) => r.need === g.need)!;
      expectClose(row.provided.value, g.provided, `${g.need} provided`);
      expectClose(row.needed.value, g.needed, `${g.need} needed`);
      expectClose(row.pct.value, g.pct, `${g.need} %`);
      expect(row.covered, `${g.need} covered`).toBe(g.covered);
      expect(row.unit).toBe(g.unit);
    }
  });

  it('matches the overall score and humans count', () => {
    expectClose(result.overallScore.value, goldens.overallScore, 'overall score');
    expect(result.humans.value).toBe(goldens.humans);
  });

  it('matches every Design Summary metric', () => {
    for (const [key, value] of Object.entries(goldens.summary)) {
      const mine = result.summary[key as keyof typeof result.summary];
      expect(mine, `summary key ${key}`).toBeDefined();
      expectClose(mine.value, value, `summary ${key}`);
    }
  });

  it('matches every Resources balancePotential row', () => {
    for (const [name, g] of Object.entries(goldens.resources)) {
      const r = result.resources[name]!;
      expectClose(r.produced.value, g.produced, `${name} produced`);
      expectClose(r.consumed.value, g.consumed, `${name} consumed`);
      expectClose(r.net.value, g.net, `${name} net`);
      expect(r.status, `${name} status`).toBe(g.status);
    }
  });

  it('hits the handoff numbers: 48.5% overall, 697,846 BTU/wk heat need, 4,979 of 16,000 kcal/wk food', () => {
    expect(result.overallScore.value).toBeCloseTo(0.485, 3);
    const heat = result.checklist.find((r) => r.need === 'Heated shelter')!;
    expect(Math.round(heat.needed.value)).toBe(697846);
    const food = result.checklist.find((r) => r.need === 'Food')!;
    expect(Math.round(food.provided.value)).toBe(4979);
    expect(food.needed.value).toBe(16000);
  });
});

describe('every number explains itself', () => {
  it('lists the flows behind the heat need, each with its count and weekly factor', () => {
    const heat = result.checklist.find((r) => r.need === 'Heated shelter')!;
    expect(heat.needed.explain.terms.length).toBeGreaterThan(0);
    const total = heat.needed.explain.terms.reduce(
      (a, t) => a + t.qty * t.factor * t.count * (t.needFactor ?? 1),
      0,
    );
    expectClose(total, heat.needed.value, 'terms add up');
    expect(heat.needed.explain.assumptions).toContain('hdd');
  });

  it('converts eggs into kcal with the Resources factor in the food row', () => {
    const food = result.checklist.find((r) => r.need === 'Food')!;
    const egg = food.provided.explain.terms.find(
      (t) => catalog.flows.find((f) => f.id === t.flowId)?.resource === 'Eggs',
    );
    expect(egg?.needFactor).toBe(70);
  });

  it('explains percentages with their provided and needed refs', () => {
    const elec = result.checklist.find((r) => r.need === 'Electricity')!;
    expect(elec.pct.explain.refs).toEqual({ provided: 14, needed: 24 });
  });
});
