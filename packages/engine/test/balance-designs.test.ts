import { catalog } from '@homestead/catalog';
import { describe, expect, it } from 'vitest';
import { balance, balanceValues, digest } from '../src/index.ts';
import { expectDigest, loadDesign } from './fixtures.ts';

const DESIGNS = [
  'starter.json',
  'offgrid-cabin-family.json',
  'suburban-baseline.json',
  'tent-and-nothing.json',
];

describe('hand-built designs keep their balance-mode results', () => {
  for (const file of DESIGNS) {
    it(`${file} matches its committed digest`, () => {
      const { design } = loadDesign(file);
      const r = balance(catalog, catalog.assumptions, design);
      expectDigest(`balance:${file}`, digest(balanceValues(r)));
    });
  }

  it('a family of four needs four times one person’s drinking water', () => {
    const one = balance(catalog, catalog.assumptions, loadDesign('tent-and-nothing.json').design);
    const four = balance(catalog, catalog.assumptions, loadDesign('suburban-baseline.json').design);
    const dw = (r: typeof one) => r.checklist.find((c) => c.need === 'Drinking water')!.needed.value;
    expect(dw(four)).toBe(4 * dw(one));
  });

  it('a tent with nothing else covers shelter and labor but nothing else', () => {
    const r = balance(catalog, catalog.assumptions, loadDesign('tent-and-nothing.json').design);
    const covered = r.checklist.filter((c) => c.covered === '✓').map((c) => c.need);
    expect(covered).toEqual(['Shelter', 'Est. Required Labor']);
  });

  it('an empty design scores zero and needs nothing', () => {
    const r = balance(catalog, catalog.assumptions, { counts: {} });
    expect(r.overallScore.value).toBe(0);
    expect(r.checklist.every((c) => c.covered === 'n/a')).toBe(true);
  });

  it('colder sites raise the heat need in proportion to heating degree-days', () => {
    const { design } = loadDesign('starter.json');
    const base = balance(catalog, catalog.assumptions, design);
    const cold = balance(catalog, { ...catalog.assumptions, hdd: 9000 }, design);
    const heat = (r: typeof base) => r.checklist.find((c) => c.need === 'Heated shelter')!.needed.value;
    expect(heat(cold) / heat(base)).toBeCloseTo(1.5, 12);
  });
});

describe('performance', () => {
  it('runs 1,000 balance calls on a 200-instance design in under 200 ms', () => {
    const { design } = loadDesign('offgrid-cabin-family.json');
    // Scale the cabin design up to 200 instances.
    const total = Object.values(design.counts).reduce((a, b) => a + b, 0);
    const scale = 200 / total;
    const counts = Object.fromEntries(
      Object.entries(design.counts).map(([k, v]) => [k, Math.max(1, Math.round(v * scale))]),
    );
    const big = { counts };
    for (let i = 0; i < 200; i++) balance(catalog, catalog.assumptions, big); // warm up the JIT
    // Best of three batches: other test files run in parallel and add noise.
    let ms = Infinity;
    for (let batch = 0; batch < 3; batch++) {
      const t0 = performance.now();
      for (let i = 0; i < 1000; i++) balance(catalog, catalog.assumptions, big);
      ms = Math.min(ms, performance.now() - t0);
    }
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(190);
    console.log(`1000 balance calls: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(200);
  });
});
