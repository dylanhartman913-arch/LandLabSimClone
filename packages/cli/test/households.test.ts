import { describe, expect, it } from 'vitest';
import { catalog, getSite, getStart } from '@homestead/catalog';
import { gameDigest, gameFromStart } from '@homestead/engine';
import { compareToDefault, measureHouseholds, type HouseholdRun } from '../bots/households.ts';

const named = (s: ReturnType<typeof gameFromStart>, name: string) => s.instances.filter((i) => i.systemId === catalog.systems.find((x) => x.name === name)!.id).length;

describe('start kits grow with the household', () => {
  // One test per start (a long synchronous test starves the worker's progress reports).
  const runs: HouseholdRun[] = [];
  for (const start of ['adapt', 'greenfield', 'cabin', 'farm'])
    it(`${start}: every household the start screen allows starts no worse off than the default one`, () => {
      const here = compareToDefault(measureHouseholds({ starts: [start] }));
      runs.push(...here.map((c) => c.run));
      expect(here.filter((c) => !c.pass).map((c) => `${c.run.adults}+${c.run.children} on ${c.run.site}`)).toEqual([]);
    }, 60_000);

  it('on every start and site, a bigger household starts as well covered as the default one and stays home about as long', () => {
    const results = compareToDefault(runs);
    const misses = results.filter((c) => !c.pass).map((c) => `${c.run.start} ${c.run.adults}+${c.run.children} on ${c.run.site}: ${[...c.short, ...(c.early ? [`left day ${c.run.leftOn} vs ${c.base.leftOn}`] : [])].join(', ')}`);
    expect(misses).toEqual([]);
    expect(results).toHaveLength(144);
  });

  it('the check has teeth: the kit before scaling fails it for four adults on greenfield', () => {
    const results = compareToDefault(measureHouseholds({ starts: ['greenfield'], sites: ['laramie-wy'], fixed: true, days: 120 }));
    const four = results.find((c) => c.run.adults === 4 && c.run.children === 0)!;
    expect(four.pass).toBe(false);
    expect(four.short).toContain('Sanitation');
  });

  it('the default household gets exactly the kit it always had', () => {
    for (const id of ['adapt', 'greenfield', 'cabin', 'farm']) {
      const start = getStart(id);
      const plain = { ...start, household: { ...start.household, extra: [] } };
      expect(gameDigest(gameFromStart(catalog, getSite('asheville-nc'), start))).toBe(gameDigest(gameFromStart(catalog, getSite('asheville-nc'), plain)));
    }
  });

  it('greenfield adds a camp per two extra people (a child counts as 0.7), with its sawdust', () => {
    const site = getSite('front-range');
    const start = getStart('greenfield');
    const tents = (h: number, c = 0) => named(gameFromStart(catalog, site, start, { household: h, children: c }), 'Canvas Wall Tent + Stove Jack');
    expect([tents(1), tents(2), tents(3), tents(4), tents(2, 2), tents(4, 3)]).toEqual([1, 1, 2, 2, 2, 4]);
    const base = gameFromStart(catalog, site, start);
    const four = gameFromStart(catalog, site, start, { household: 4 });
    expect(four.stocks.Carbon).toBeCloseTo(base.stocks.Carbon! * 2 + 100, 9);
  });

  it('jobs follow adults, not children', () => {
    const site = getSite('front-range');
    const jobs = (h: number, c: number) => named(gameFromStart(catalog, site, getStart('farm'), { household: h, children: c }), 'Average Job');
    expect([jobs(2, 0), jobs(2, 3), jobs(3, 0), jobs(4, 3)]).toEqual([1, 1, 2, 2]);
  });
});
