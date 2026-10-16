import { getSite } from '@homestead/catalog';
import { describe, expect, it } from 'vitest';
import {
  checklistView,
  computeSpatial,
  designBalance,
  initGame,
  moveSystem,
  placeDesign,
  placeSystem,
  setLink,
  stepDays,
  type GameState,
} from '../src/index.ts';
import { loadDesign } from './fixtures.ts';
import { advanceTo, catalog, need, newGame, place, run, sysId } from './time-helpers.ts';

const cool = (g: GameState) =>
  designBalance(g, catalog).checklist.find((r) => r.need === 'Cooled shelter')!.needed;

describe('space matters', () => {
  it('moving a tree next to a cabin lowers its cooling load, and the why says so', () => {
    // Open ground, away from the site's existing trees.
    let g = newGame({});
    g = place(g, 'Log Cabin Kit', 100, 150).state;
    const { state, instanceId: oak } = place(g, 'Oak Tree', 180, 190);
    const far = cool(state).value;
    const near = moveSystem(catalog, state, oak, 100, 185);
    const c = cool(near);
    expect(c.value).toBeCloseTo(far * 0.9, 6);
    expect(c.explain.terms.find((t) => t.adjust !== undefined)?.adjust).toBeCloseTo(0.9, 9);
    expect(c.explain.notes?.join(' ')).toMatch(/Shade trees within 30 ft.*Oak Tree/);
  });

  it('shade stacks per tree but never takes off more than 30%', () => {
    let g = newGame({});
    g = place(g, 'Log Cabin Kit', 100, 150).state;
    const base = cool(g).value;
    for (const [x, y] of [
      [100, 182],
      [132, 150],
      [68, 150],
      [100, 118],
      [130, 180],
    ] as const)
      g = place(g, 'Oak Tree', x, y).state;
    expect(cool(g).value).toBeCloseTo(base * 0.7, 6);
  });

  it('the site’s existing trees shade too (Asheville has three)', () => {
    const g = initGame(catalog, getSite('asheville-nc'), {}, 1);
    const side = Math.sqrt(43560);
    const t = g.site.terrain.existingTrees[0]!;
    const s = placeSystem(
      catalog,
      g,
      sysId('Tiny House on Wheels'),
      t.x * side + 20,
      t.y * side + 20,
      'prebuilt',
    ).state;
    const sp = computeSpatial(catalog, s).get(s.instances[0]!.id)!;
    expect(sp.inMult['Cooling']).toBeLessThan(1);
    expect(sp.notes.join(' ')).toMatch(/existing/);
  });

  it('bees only pollinate within 300 ft', () => {
    const g = newGame({}, { settings: { parcelAcres: 20 } });
    const { state: withHive } = place(g, 'Beehive + Bee Colony', 20, 20);
    const near = place(withHive, 'Raised Beds (24 sq ft)', 100, 100);
    const far = place(near.state, 'Raised Beds (24 sq ft)', 800, 800);
    const sp = computeSpatial(catalog, far.state);
    expect(sp.get(near.instanceId)!.gated['Pollination']).toBe(true);
    expect(sp.get(far.instanceId)!.gated['Pollination']).toBe(false);
  });

  it('chickens beside the compost pile add 10% to its compost', () => {
    let g = newGame({});
    const { state, instanceId: pile } = place(g, 'Compost Piles', 60, 60);
    g = place(state, 'Chicken Coop (12 hens)', 60, 75).state;
    expect(computeSpatial(catalog, g).get(pile)!.outMult['Compost']).toBeCloseTo(1.1, 9);
  });

  it('a wind turbine near trees loses 30%', () => {
    let g = newGame({}, { settings: { parcelAcres: 5 } });
    const { state, instanceId: t } = place(g, 'Small Wind Turbine (1.5 kW)', 60, 60);
    g = place(state, 'Poplar Tree', 60, 140).state;
    expect(computeSpatial(catalog, g).get(t)!.outMult['Electricity']).toBeCloseTo(0.7, 9);
  });

  it('rain catchment needs a roof within 50 ft, and can be linked to a chosen one', () => {
    let g = newGame({ 'Human Being': 1 }, { settings: { parcelAcres: 2 } });
    const tank = place(g, 'Rainwater Collection System + Cistern (550 Gallons)', 30, 30);
    g = tank.state;
    expect(computeSpatial(catalog, g).get(tank.instanceId)!.assigned['Roofing area']).toMatchObject({
      providerId: null,
      share: 0,
    });
    const cabin = place(g, 'Log Cabin Kit', 30, 70);
    g = cabin.state;
    const a = computeSpatial(catalog, g).get(tank.instanceId)!.assigned['Roofing area']!;
    expect(a.providerId).toBe(cabin.instanceId);
    expect(a.share).toBeCloseTo(900 / 1000, 9); // the cabin's roof is 900 sq ft for a 1,000 sq ft collector
    const shed = place(g, 'Yurt', 70, 30);
    g = setLink(shed.state, tank.instanceId, 'Roofing area', shed.instanceId);
    expect(computeSpatial(catalog, g).get(tank.instanceId)!.assigned['Roofing area']!.providerId).toBe(
      shed.instanceId,
    );
    // With no roof in reach, the tank collects nothing in time mode.
    const lonely = advanceTo(
      place(newGame({}), 'Rainwater Collection System + Cistern (550 Gallons)', 30, 30).state,
      150,
    );
    expect(run(lonely, 20).ledgers.reduce((x, l) => x + l.resources['Water']!.produced, 0)).toBe(0);
  });

  it('slope helps swales and hurts ponds (Asheville is a 12% slope)', () => {
    const g = initGame(catalog, getSite('asheville-nc'), { parcelAcres: 5 }, 1);
    const s1 = placeSystem(catalog, g, sysId('Swales & Berms Earthworks'), 100, 100, 'prebuilt');
    const s2 = placeSystem(catalog, s1.state, sysId('Pond (1/10 acre)'), 300, 300, 'prebuilt');
    const sp = computeSpatial(catalog, s2.state);
    expect(sp.get(s1.instanceId)!.outMult['Water']).toBeCloseTo(1.48, 9);
    expect(sp.get(s2.instanceId)!.outMult['Water']).toBeCloseTo(0.64, 9);
  });

  it('a child counts as 0.6 of a person', () => {
    const g = newGame({ 'Human Being': 1 });
    const child = { ...g.instances[0]!, id: 'child', scale: 0.6 };
    const s = { ...g, instances: [...g.instances, child] };
    const food = designBalance(s, catalog).checklist.find((r) => r.need === 'Food')!.needed.value;
    expect(food).toBeCloseTo(14000 * 1.6, 6);
    expect(need(run(s, 7).ledgers, 'Food').needed).toBeCloseTo(14000 * 1.6, 3);
  });
});

describe('two sites, one design', () => {
  it('Laramie and Asheville differ in heat, water, and garden, each traceable to a site value', () => {
    const { design } = loadDesign('offgrid-cabin-family.json');
    const on = (site: string) => {
      const g = placeDesign(
        catalog,
        initGame(catalog, getSite(site), { parcelAcres: 5, startDay: 150 }, 1),
        design.counts,
      );
      return stepDays(g, catalog, 120).state;
    };
    const lar = on('laramie-wy');
    const ash = on('asheville-nc');
    const heat = (s: GameState) =>
      checklistView(s, catalog, 'average').rows.find((r) => r.need === 'Heated shelter')!.needed;
    expect(heat(lar).value).toBeGreaterThan(heat(ash).value * 2);
    expect(heat(lar).explain.assumptions).toContain('hdd');
    const water = (s: GameState) =>
      checklistView(s, catalog, 'season').rows.find((r) => r.need === 'Water')!.pct;
    expect(water(lar).explain.assumptions).toContain('precipIn');
    const food = (s: GameState) => checklistView(s, catalog, 'season').rows.find((r) => r.need === 'Food')!;
    expect(food(lar).pct.explain.refs!['growingSeasonDays']).toBe(98);
    expect(food(ash).pct.explain.refs!['growingSeasonDays']).toBe(184);
    expect(food(lar).provided.value).not.toBeCloseTo(food(ash).provided.value, 0);
  });
});
