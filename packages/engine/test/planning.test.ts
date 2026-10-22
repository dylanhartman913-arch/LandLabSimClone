import { describe, expect, it } from 'vitest';
import { catalog, newGame, place, run, sysId } from './time-helpers.ts';
import {
  computeSpatial,
  moveSystem,
  constructionView,
  designBalance,
  designFromGame,
  gameDigest,
  getPlans,
  gapFt,
  planningBaseline,
  planningFingerprint,
  placementPreview,
  projectPreview,
  rangeDistanceText,
  replay,
  scenarioSummary,
  sensitivity,
  transitionForecast,
  weatherRiskPolicy,
  type Action,
  type GameInit,
} from '../src/index.ts';
import spring from './fixtures/playtest/spring.json';

const springGame = () => replay(catalog, spring.init as GameInit, spring.actions as Action[], spring.absDay);

describe('project decisions before purchase', () => {
  it('the yurt spends $6,000 of the actual spring budget and adds heat for an unused shelter', () => {
    const s = springGame();
    const original = structuredClone(s);
    const p = projectPreview(s, catalog, sysId('Yurt'), 'diy');
    expect(p.cost.value).toBe(6000);
    expect(p.cashAfter.value).toBe(1784);
    expect(p.winter!.added.value).toBeGreaterThan(500000);
    expect(p.winter!.gap.value).toBeGreaterThan(100000);
    expect(p.demand.find((r) => r.resource === 'Heat')!.delta.value).toBe(p.winter!.added.value);
    expect(p.eta).toBeGreaterThan(0);
    expect(p.crew!.cost).toBe(1400);
    expect(p.crew!.days).toBe(5);
    expect(p.cashAfterCrew.value).toBe(384);
    expect(p.recurring.some((f) => f.resource === 'Labor')).toBe(true);
    expect(s).toEqual(original);
  });

  it('beds and coops show calories for two adults without treating a demonstration as independence', () => {
    const s = springGame();
    const bed = projectPreview(s, catalog, sysId('Raised Beds (24 sq ft)'), 'diy');
    const coop = projectPreview(s, catalog, sysId('Chicken Coop (12 hens)'), 'diy');
    expect(bed.food!.perPerson.value).toBeCloseTo(3.708791, 4);
    expect(bed.food!.share.value).toBeLessThan(0.002);
    expect(coop.food!.share.value).toBeCloseTo(0.1375, 5);
    expect(coop.food!.perPerson.value).toBeCloseTo(coop.food!.daily.value / 2, 10);
    expect(coop.demand.some((r) => r.resource === 'Chicken feed' && r.delta.value > 0)).toBe(true);
    expect(bed.materials.find((m) => m.resource === 'Soil')!.needed.value).toBe(24);
    expect(bed.food!.timing).toMatch(/season|window/);
  });

  it('a window crop explains daily distribution and the harvest event instead of a single payout', () => {
    const p = projectPreview(springGame(), catalog, sysId('Apple Tree'), 'diy');
    expect(p.food!.timing).toContain('daily during days');
    expect(p.food!.timing).toContain('marks the start');
  });

  it('the selected construction mode changes cash, labor and the simulated schedule', () => {
    const s = springGame();
    const diy = projectPreview(s, catalog, sysId('Yurt'), 'diy');
    const buy = projectPreview(s, catalog, sysId('Yurt'), 'buy');
    expect(buy.hours.value).toBe(diy.hours.value * 0.25);
    expect(buy.cashAfter.value).toBeLessThan(diy.cashAfter.value);
    expect(buy.eta).toBeLessThan(diy.eta!);
  });
});

describe('placement reach and overlap are independent', () => {
  const shelter = () => place(newGame({}), 'Yurt', 100, 100).state;
  const heater = sysId('Rocket Mass Heater');
  const boundary = () => {
    const radius = catalog.resources.find((r) => r.name === 'Heat')!.deliveryRadiusFt;
    const half = Math.sqrt(catalog.systems.find((s) => s.id === heater)!.footprintSqft) / 2;
    const sh = Math.sqrt(catalog.systems.find((s) => s.id === sysId('Yurt'))!.footprintSqft) / 2;
    return { x: 100 + sh + half + radius, y: 100, radius };
  };
  it('reach just inside and outside the exact edge-gap cutoff agrees with live allocation', () => {
    const s = shelter();
    const p = boundary();
    const inside = placementPreview(s, catalog, heater, p.x - 0.000001, p.y);
    const outside = placementPreview(s, catalog, heater, p.x + 0.000001, p.y);
    expect(inside.valid).toBe(true);
    expect(inside.connections.find((c) => c.resource === 'Heat')!.inRange).toBe(true);
    expect(inside.warning).toBeNull();
    expect(outside.valid).toBe(true);
    expect(outside.connections.find((c) => c.resource === 'Heat')!.inRange).toBe(false);
    expect(outside.connections.find((c) => c.resource === 'Heat')!.text).toContain(`> ${p.radius} ft limit`);
    expect(outside.warning).toContain('No delivered Heat');
    expect(rangeDistanceText(p.radius - 0.000001, p.radius)).toContain(`< ${p.radius} ft limit`);
    expect(gapFt(0, 0, 2, 20, 0, 3)).toBe(15);
  });

  it('a heater a hair outside reach is never told "10 ft away, must be within 10 ft", and the gap is edge to edge', () => {
    const p = boundary();
    const s = place(shelter(), 'Rocket Mass Heater', p.x + 0.001, p.y).state;
    const note = computeSpatial(catalog, s).get(s.instances.at(-1)!.id)!.notes.join(' ');
    expect(note).toContain("doesn't reach a shelter");
    expect(note).toContain('edge-to-edge gap');
    expect(note).toContain(`> ${p.radius} ft limit (outside by`);
    expect(note).not.toMatch(new RegExp(`\\b${p.radius}(\\.00)? ft /`));
    expect(rangeDistanceText(p.radius, p.radius)).toBe(`= ${p.radius} ft limit (in range)`);
  });

  it('an overlapping heater still shows reach while independently failing placement validation', () => {
    const v = placementPreview(shelter(), catalog, heater, 100, 100);
    expect(v.valid).toBe(false);
    expect(v.validation).toContain('overlaps');
    expect(v.connections.find((c) => c.resource === 'Heat')!.inRange).toBe(true);
  });

  it('moving a roof consumer preserves allocation order when roof capacity is scarce', () => {
    let s = shelter();
    const first = place(s, 'Rainwater Collection System + Cistern (550 Gallons)', 120, 100);
    s = place(first.state, 'Rainwater Collection System + Cistern (550 Gallons)', 120, 110).state;
    const preview = placementPreview(
      s,
      catalog,
      sysId('Rainwater Collection System + Cistern (550 Gallons)'),
      122,
      100,
      [{ id: first.instanceId, x: 122, y: 100 }],
    );
    const actual = computeSpatial(catalog, moveSystem(catalog, s, first.instanceId, 122, 100)).get(
      first.instanceId,
    )!;
    expect(actual.assigned['Roofing area']!.share).toBe(0.3);
    expect(preview.notes).toEqual(actual.notes);
  });

  it('moving a heater updates its connection without charging cash or altering the game', () => {
    const s = place(shelter(), 'Rocket Mass Heater', 117, 100).state;
    const i = s.instances.at(-1)!;
    const original = structuredClone(s);
    expect(placementPreview(s, catalog, heater, 117, 100, [{ id: i.id, x: 117, y: 100 }]).warning).toBeNull();
    expect(placementPreview(s, catalog, heater, 200, 200, [{ id: i.id, x: 200, y: 200 }]).warning).toContain(
      'No delivered Heat',
    );
    expect(s).toEqual(original);
  });
});

describe('planning tools share geometry and identify their policies', () => {
  it('scenario, sensitivity and planned checklist have identical baseline scores with unfinished spatial systems', () => {
    const s = place(springGame(), 'Yurt', 150, 140, 'diy').state;
    const b = planningBaseline(s, catalog);
    expect(b.summary.overall.value).toBe(designBalance(s, catalog).overallScore.value);
    expect(scenarioSummary(catalog, b.file).overall.value).toBe(b.summary.overall.value);
    expect(sensitivity(catalog, b.assumptions, b.design).baseScore).toBe(b.summary.overall.value);
    expect(b.summary.labor.setup.value).toBeGreaterThan(0);
  });

  it('a controlled solar fixture responds to sun, while unused wind is explicitly inactive', () => {
    const s = newGame({
      'Human Being': 1,
      Yurt: 1,
      '500W Photovoltaic Panels': 2,
      'LiFePO4 Battery Bank (10 kWh)': 1,
      Well: 1,
    });
    const b = planningBaseline(s, catalog);
    const t = sensitivity(catalog, b.assumptions, b.design);
    const sun = t.bars.find((b) => b.key === 'psh')!;
    expect(sun.activity).toBe('responsive');
    expect(Math.abs(sun.lowDelta) + Math.abs(sun.highDelta)).toBeGreaterThan(0);
    expect(t.bars.find((b) => b.key === 'windCf')!.activity).toBe('inactive');
    expect(sun.lowDelta).toBe((sun.low - t.baseScore) * 100);
  });

  it('weather risk states its fresh reserves and absent live policies, and stale fingerprints depend on layout', () => {
    const s = springGame();
    const f = designFromGame(catalog, s, 'snapshot');
    const policy = weatherRiskPolicy(catalog, f, s.site.id);
    expect(policy).toContain('28,000 kcal Food');
    expect(policy).toContain('no auto-gather');
    expect(policy).toContain('remain on site at zero wellbeing');
    expect(policy).toContain('not carried over');
    expect(planningFingerprint(f, s.site.id)).toBe(planningFingerprint({ ...f, name: 'renamed' }, s.site.id));
    expect(planningFingerprint(f, s.site.id)).not.toBe(
      planningFingerprint(
        { ...f, layout: f.layout!.map((p, i) => (i === 0 ? { ...p, x: p.x + 1 } : p)) },
        s.site.id,
      ),
    );
  });

  it('daily gathering cannot consume natural nodes in an earlier saved state', () => {
    const s = springGame();
    const before = structuredClone(s.nodeStock);
    const result = run(s, 7);
    expect(result.ledgers.some((l) => (l.gathered?.length ?? 0) > 0)).toBe(true);
    expect(s.nodeStock).toEqual(before);
    expect(result.state.nodeStock).not.toBe(s.nodeStock);
  });

  it('the transition forecast preserves the real budget, projects and wellbeing, without mutating the save', () => {
    const s = place(springGame(), 'Yurt', 150, 140, 'diy').state;
    const original = structuredClone(s);
    const v = transitionForecast(s, catalog, 30);
    const actual = run(s, 30);
    expect(v.cashEnd.value).toBe(actual.state.cash);
    expect(v.completions.some((c) => c.name === 'Yurt')).toBe(true);
    expect(v.minCash.value).toBeLessThanOrEqual(s.cash);
    expect(v.minWellbeing!.value).toBeLessThanOrEqual(100);
    expect(s).toEqual(original);
    expect(gameDigest(s)).toBe(gameDigest(original));
    expect(constructionView(s, catalog).find((p) => p.name === 'Yurt')!.eta).toBe(
      v.completions.find((p) => p.name === 'Yurt')!.days,
    );
    expect(
      getPlans(catalog, s.site)
        .bySystem.get(sysId('Yurt'))!
        .inputs.some((f) => f.resource === 'Heat'),
    ).toBe(true);
  });
});
