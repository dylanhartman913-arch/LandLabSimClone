import { describe, expect, it } from 'vitest';
import {
  applyAction, checklistView, designBalance, designForGame, gameDigest, hudMetrics, placeSystem,
  replay, resourceWeek, sensitivity, stockpileView, systemCard, waterReserveWarning, workView,
  type Action, type GameInit,
} from '../src/index.ts';
import spring from './fixtures/playtest/spring.json';
import winter from './fixtures/playtest/winter.json';
import { catalog, newGame, place, run, sysId } from './time-helpers.ts';

const replayFixture = (f: typeof spring | typeof winter, until = f.absDay) =>
  replay(catalog, f.init as GameInit, (f.actions as Action[]).filter((a) => a.at <= until), until);
const shelter = (s: ReturnType<typeof replayFixture>, mode: Parameters<typeof checklistView>[2]) =>
  checklistView(s, catalog, mode).rows.find((r) => r.need === 'Shelter')!;

describe('durable October 16 playtest reproductions', () => {
  for (const [name, f] of [['spring', spring], ['winter', winter]] as const) {
    it(`${name} replay preserves the exported simulation digest and cash`, () => {
      const s = replayFixture(f);
      expect(gameDigest(s)).toBe(f.digest);
      expect(s.cash).toBe(f.expected.cash);
      expect(s.instances.filter((i) => i.person).map((i) => i.person!.wellbeing)).toEqual(f.expected.people.map((p) => p.wellbeing));
    });
  }

  it('the hunger day excludes seed potatoes from usable food runway', () => {
    const s = replayFixture(winter, 114);
    expect(s.stocks.Food).toBe(0);
    expect(s.instances.filter((i) => i.person).some((i) => i.person!.short.food > 0)).toBe(true);
    const food = stockpileView(s, catalog).find((r) => r.key === 'food')!;
    expect(food.days.value).toBeLessThan(0.3);
    expect(food.days.explain.notes!.join(' ')).toContain('25.00 lbs reserved for planting');
  });
});

describe('unfinished projects are forecasts, not operations', () => {
  it('paused placement only changes the planned forecast, then completion changes live capacity', () => {
    const before = replayFixture(spring);
    const yurtAction = (winter.actions as Action[]).find((a) => a.kind === 'place' && a.systemId === sysId('Yurt'))!;
    const building = applyAction(catalog, before, yurtAction);
    const yurt = building.instances.at(-1)!;
    expect(yurt.status).toBe('building');
    expect(systemCard(building, catalog, yurt.systemId, yurt.id).instance!.setupProgress.value).toBe(0);
    expect(shelter(building, 'average').provided.value).toBe(538);
    expect(shelter(building, 'completed').provided.value).toBe(224);
    expect(shelter(building, 'current').provided.value).toBe(shelter(before, 'current').provided.value);
    expect(hudMetrics(building, catalog).score.value).toBe(hudMetrics(before, catalog).score.value);
    expect(resourceWeek(building, catalog)).toEqual(resourceWeek(before, catalog));
    const r = run(building, 30);
    const firstBuilt = r.ledgers.findIndex((l) => l.needs.Shelter.provided > 224);
    expect(firstBuilt).toBeGreaterThan(0);
    expect(r.ledgers.slice(0, firstBuilt).every((l) => l.needs.Shelter.provided === 224)).toBe(true);
    expect(r.ledgers[firstBuilt]!.needs.Shelter.provided).toBe(538);
    expect(r.state.instances.find((i) => i.id === yurt.id)!.status).toBe('active');
  });

  it('a building instance cannot inherit live output from another instance of the same system', () => {
    let s = run(newGame({ 'Human Being': 1, 'Rain Barrel (55 gal)': 1 }), 2).state;
    const p = placeSystem(catalog, s, sysId('Rain Barrel (55 gal)'), 160, 160, 'diy');
    s = p.state;
    const c = systemCard(s, catalog, sysId('Rain Barrel (55 gal)'), p.instanceId);
    expect(c.basis).toContain('Under construction');
    expect(c.outputs.every((o) => o.produced.value === 0)).toBe(true);
    expect(c.inputs.filter((i) => i.view.flow.period !== 'One-time').every((i) => i.supplied.value === 0)).toBe(true);
  });

  it('current operations with no ledgers never silently substitutes the annual forecast', () => {
    const s = newGame({ 'Human Being': 1, 'Bell Tent': 1 });
    const current = checklistView(s, catalog, 'current');
    expect(current.mode).toBe('current');
    expect(current.rows.every((r) => r.provided.value === 0)).toBe(true);
    expect(current.summary).toContain('No measured days');
    expect(shelter(s, 'average').provided.value).toBeGreaterThan(0);
  });

  it('a new season does not present the previous season as measured current-season data', () => {
    const s = replayFixture(spring); // June 1; the last measured day is May 31.
    expect(checklistView(s, catalog, 'season').rows.every((r) => r.provided.value === 0)).toBe(true);
    expect(checklistView(s, catalog, 'current').rows.some((r) => r.provided.value > 0)).toBe(true);
  });

  it('uncompleted spatial modifiers only affect the planned forecast', () => {
    const s = newGame({ 'Bell Tent': 1, 'Human Being': 1 });
    const tent = s.instances.find((i) => i.systemId === sysId('Bell Tent'))!;
    const b = place(s, 'Wool Blankets & Sleeping Bags', tent.x, tent.y, 'buy').state;
    const heat = (s: typeof b, scope: 'planned' | 'completed') => designBalance(s, catalog, scope).checklist.find((r) => r.need === 'Heated shelter')!.needed.value;
    expect(heat(b, 'completed')).toBe(heat(s, 'completed'));
    expect(heat(b, 'planned')).toBeCloseTo(heat(s, 'planned') * 0.2, 8);
  });

  it('sensitivity uses the same planned design, ambient supply and spatial delivery as the forecast', () => {
    const s = replayFixture(spring);
    const t = sensitivity(catalog, s.site.assumptions, designForGame(s, catalog));
    expect(t.baseScore).toBe(designBalance(s, catalog).overallScore.value);
  });
});

describe('reserves and work describe what can actually be used', () => {
  it('seed-only stock cannot be called meals, for active or unfinished gardens', () => {
    for (const mode of ['prebuilt', 'diy'] as const) {
      let s = newGame({ 'Human Being': 1 });
      s = place(s, 'Potato Patch (400 sq ft)', 120, 120, mode).state;
      s = { ...s, stocks: { ...s.stocks, Food: 0, 'Root crops': 25 } };
      expect(stockpileView(s, catalog).find((x) => x.key === 'food')!.days.value).toBe(0);
      s = { ...s, stocks: { ...s.stocks, Food: 2000 } };
      expect(stockpileView(s, catalog).find((x) => x.key === 'food')!.days.value).toBe(1);
    }
  });

  it('food assigned to milling is excluded before estimating meals', () => {
    let s = newGame({ 'Human Being': 1, 'Grain Mill': 1 }, { settings: { startingStocks: { Food: 0, Grain: 100 } } });
    const mill = s.instances.find((i) => i.systemId === sysId('Grain Mill'))!;
    const withMill = stockpileView(s, catalog).find((x) => x.key === 'food')!;
    s = { ...s, instances: s.instances.filter((i) => i.id !== mill.id) };
    const withoutMill = stockpileView(s, catalog).find((x) => x.key === 'food')!;
    expect(withMill.days.value).toBeLessThan(withoutMill.days.value);
    expect(withMill.days.explain.notes!.join(' ')).toContain('requested directly today');
  });

  it('raw water does not extend the safe drinking-water runway', () => {
    const s = newGame({ 'Human Being': 1 }, { settings: { startingStocks: { Water: 500, 'Drinking water': 0 } } });
    expect(stockpileView(s, catalog).find((x) => x.key === 'drinking-water')!.days.value).toBe(0);
  });

  it('a completed building shows its one-time materials as already supplied', () => {
    const s = replayFixture(spring);
    const bed = s.instances.find((i) => i.systemId === sysId('Raised Beds (24 sq ft)'))!;
    const c = systemCard(s, catalog, bed.systemId, bed.id);
    const soil = c.inputs.find((x) => x.view.resource === 'Soil')!;
    expect(soil.share.value).toBe(1);
    expect(soil.supplied.explain.formula).toContain('supplied during construction');
  });

  it('HUD and Work totals include gathering and agree with the sum of every work category', () => {
    const s = replayFixture(spring);
    const v = workView(s, catalog);
    const sum = v.rows.reduce((a, r) => a + r.hoursWeek.value, 0);
    expect(v.rows.find((r) => r.job === 'gather-water')!.hoursWeek.value).toBeGreaterThan(0);
    expect(hudMetrics(s, catalog).laborUsedWeek.value).toBeCloseTo(sum, 10);
    expect(v.workedWeek.value).toBeCloseTo(sum, 10);
    expect(v.idleWeek.value + v.workedWeek.value).toBeCloseTo(v.poolWeek.value, 10);
  });

  it('paid work is separated from maintenance without adding hours twice', () => {
    const s = replayFixture(winter, 120);
    const v = workView(s, catalog);
    expect(v.breakdown.employment.value).toBeGreaterThan(0);
    expect(Object.values(v.breakdown).reduce((a, x) => a + x.value, 0)).toBeCloseTo(v.workedWeek.value, 10);
  });

  it('a reserve target beyond completed storage warns, and an unfinished cistern cannot clear it', () => {
    const s = replayFixture(spring);
    const w = waterReserveWarning(s, catalog);
    expect(w.join(' ')).toContain('105 gal');
    const b = place(s, 'Rainwater Collection System + Cistern (550 Gallons)', 175, 90, 'diy').state;
    expect(waterReserveWarning(b, catalog)).toEqual(w);
    const active = { ...b, instances: b.instances.map((i) => i.status === 'building' ? { ...i, status: 'active' as const } : i) };
    expect(waterReserveWarning(active, catalog)).toEqual([]);
  });
});

describe('labor held for a system that cannot run is not lost', () => {
  // One adult, a big DIY build allowed the whole pool: upkeep (priority 1) and construction compete.
  const game = (counts: Record<string, number>) =>
    place(newGame({ 'Human Being': 1, ...counts }, { settings: { constructionShare: 1, reuseIdleLabor: true } }), 'Yurt', 140, 140, 'diy').state;
  const day = (counts: Record<string, number>) => run(game(counts), 1).ledgers[0]!;

  it('a part-time job with no transport earns nothing and leaves its hours to construction', () => {
    const without = day({});
    const stalled = day({ 'Part-Time Job (20 hrs)': 1 });
    const job = sysId('Part-Time Job (20 hrs)');
    expect(stalled.curtailed.find((c) => c.systemId === job)?.limitedBy).toBe('Transportation');
    expect(stalled.laborBySystem[job] ?? 0).toBe(0);
    expect(stalled.labor.pool).toBeCloseTo(without.labor.pool, 9);
    expect(stalled.labor.construction).toBeCloseTo(without.labor.construction, 9);
    expect(stalled.labor.unused).toBeCloseTo(without.labor.unused, 9);
  });

  it('a job that can run still takes its labor first', () => {
    const without = day({});
    const working = day({ 'Remote Job (40 hrs)': 1 });
    expect(working.laborBySystem[sysId('Remote Job (40 hrs)')]).toBeGreaterThan(0);
    expect(working.labor.construction).toBeLessThan(without.labor.construction);
  });

  it('legacy logs without the setting keep their recorded behavior', () => {
    const legacy = run(
      place(newGame({ 'Human Being': 1, 'Part-Time Job (20 hrs)': 1 }, { settings: { constructionShare: 1 } }), 'Yurt', 140, 140, 'diy').state,
      1,
    ).ledgers[0]!;
    expect(legacy.labor.construction).toBeCloseTo(day({}).labor.construction - 20 / 7, 9);
  });

  it('reused hours never pay an outside crew twice or exceed the pool', () => {
    const l = run(game({ 'Part-Time Job (20 hrs)': 1 }), 1).ledgers[0]!;
    const byJob = Object.values(l.labor.byJob ?? {}).reduce((a, h) => a + h!, 0);
    expect(byJob + l.labor.unused).toBeCloseTo(l.labor.pool, 9);
  });
});
