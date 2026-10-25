import { catalog } from '@homestead/catalog';
import { describe, expect, it } from 'vitest';
import { balancePotential, balanceValues, digest } from '../src/index.ts';
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
      const r = balancePotential(catalog, catalog.assumptions, design);
      expectDigest(`balance:${file}`, digest(balanceValues(r)));
    });
  }

  it('a family of four needs four times one person’s drinking water', () => {
    const one = balancePotential(catalog, catalog.assumptions, loadDesign('tent-and-nothing.json').design);
    const four = balancePotential(catalog, catalog.assumptions, loadDesign('suburban-baseline.json').design);
    const dw = (r: typeof one) => r.checklist.find((c) => c.need === 'Drinking water')!.needed.value;
    expect(dw(four)).toBe(4 * dw(one));
  });

  it('a tent with nothing else covers shelter and labor but nothing else', () => {
    const r = balancePotential(catalog, catalog.assumptions, loadDesign('tent-and-nothing.json').design);
    const covered = r.checklist.filter((c) => c.covered === '✓').map((c) => c.need);
    expect(covered).toEqual(['Shelter', 'Est. Required Labor']);
  });

  it('an empty design scores zero and needs nothing', () => {
    const r = balancePotential(catalog, catalog.assumptions, { counts: {} });
    expect(r.overallScore.value).toBe(0);
    expect(r.checklist.every((c) => c.covered === 'n/a')).toBe(true);
  });

  it('colder sites raise the heat need in proportion to heating degree-days', () => {
    const { design } = loadDesign('starter.json');
    const base = balancePotential(catalog, catalog.assumptions, design);
    const cold = balancePotential(catalog, { ...catalog.assumptions, hdd: 9000 }, design);
    const heat = (r: typeof base) => r.checklist.find((c) => c.need === 'Heated shelter')!.needed.value;
    expect(heat(cold) / heat(base)).toBeCloseTo(1.5, 12);
  });
});
