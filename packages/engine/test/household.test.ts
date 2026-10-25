import { describe, expect, it } from 'vitest';
import {
  applyAction,
  computeSpatial,
  gameDigest,
  householdView,
  laborFactor,
  replay,
  setRole,
  skillBonus,
  stepDays,
  systemCard,
  type GameSettings,
  type GameState,
  type GatherRecord,
  type PersonState,
} from '../src/index.ts';
import { catalog, eventsOf, newGame, run, sysId } from './time-helpers.ts';

const ON: Partial<GameSettings> = { householdRoles: true };
const rule = catalog.householdRoles!;
const supplies = { Food: 1e7, 'Drinking water': 50, Water: 5000, 'Woody biomass': 1e4 };

function home(people = 2, extra: Record<string, number> = {}, settings: Partial<GameSettings> = ON): GameState {
  return newGame(
    { 'Human Being': people, 'Bell Tent': 2, '5,000 Gallon Cistern': 1, ...extra },
    { settings: { ...settings, startingStocks: { ...supplies } } },
  );
}
const people = (s: GameState) => s.instances.filter((i) => i.person);
const withPerson = (s: GameState, k: number, f: (p: PersonState) => PersonState): GameState => {
  const id = people(s)[k]!.id;
  return { ...s, instances: s.instances.map((i) => (i.id === id ? { ...i, person: f(i.person!) } : i)) };
};

describe('LL-36 household composition and skills', () => {
  it('a child needs 70% of an adult and works a quarter; an elder needs 90% and works half', () => {
    let s = home(3);
    s = setRole(catalog, s, people(s)[1]!.id, 'child');
    s = setRole(catalog, s, people(s)[2]!.id, 'elder');
    const sp = computeSpatial(catalog, s);
    expect(sp.get(people(s)[0]!.id)!.inMult.Food).toBeUndefined();
    expect(sp.get(people(s)[1]!.id)!.inMult.Food).toBeCloseTo(0.7);
    expect(sp.get(people(s)[2]!.id)!.inMult.Food).toBeCloseTo(0.9);
    const r = run(s, 1);
    expect(r.ledgers[0]!.resources.Food!.requested).toBeCloseTo((14000 / 7) * (1 + 0.7 + 0.9));
    const adultLabor = run(home(1), 1).ledgers[0]!.labor.pool;
    const p = people(s);
    const expected = p.reduce((a, i, k) => a + adultLabor * (i.person!.health / people(home(1))[0]!.person!.health) * [1, 0.25, 0.5][k]!, 0);
    expect(r.ledgers[0]!.labor.pool).toBeCloseTo(expected);
  });

  it('children take no paid work: the employment cap counts adults (and elders at half)', () => {
    let s = home(3, { 'Average Job': 3 }, { ...ON, employmentPriority: true });
    s = setRole(catalog, s, people(s)[1]!.id, 'child');
    s = setRole(catalog, s, people(s)[2]!.id, 'elder');
    const r = run(s, 1);
    expect(r.ledgers[0]!.labor.byJob?.employment ?? 0).toBeLessThanOrEqual((1.5 * 40) / 7 + 1e-9);
  });

  it('practiced builders finish DIY projects in fewer hours', () => {
    const skilled = (s: GameState) => withPerson(withPerson(s, 0, (p) => ({ ...p, skills: { building: 150, growing: 0, gathering: 0 } })), 1, (p) => ({ ...p, skills: { building: 150, growing: 0, gathering: 0 } }));
    const novice = newGame({ 'Human Being': 2, 'Bell Tent': 2 }, { settings: { ...ON, startingStocks: { ...supplies } } });
    const place = (s: GameState) => {
      const sys = sysId('Treehouse');
      const placed = applyAction(catalog, s, { at: 0, kind: 'place', systemId: sys, x: 120, y: 120, mode: 'diy', id: `i${s.nextInstanceId}` });
      return placed;
    };
    const hoursToFinish = (s: GameState) => {
      const r = run(place(s), 120);
      const shed = r.state.instances.find((i) => i.systemId === sysId('Treehouse'))!;
      expect(shed.status).toBe('active');
      return r.ledgers.reduce((a, l) => a + l.labor.construction, 0);
    };
    const n = hoursToFinish(novice);
    const k = hoursToFinish(skilled(novice));
    expect(skillBonus(rule, 'building', 150)).toBeCloseTo(0.25);
    expect(k).toBeLessThan(n * 0.85);
  });

  it('practice accrues to each worker by their share, and gathering skill raises the yield per hour', () => {
    const s = newGame({ 'Human Being': 1, 'Bell Tent': 1, 'Tiny Wood Stove': 1 }, { settings: { ...ON, startDay: 0, autoGather: { woodWeeks: 2 }, startingStocks: { Food: 1e7, 'Drinking water': 1000 } } });
    const r = run(s, 10);
    const gathered = r.ledgers.reduce((a, l) => a + (l.labor.byJob?.['gather-wood'] ?? 0), 0);
    expect(people(r.state)[0]!.person!.skills!.gathering).toBeCloseTo(gathered);
    const pro = withPerson(s, 0, (p) => ({ ...p, skills: { building: 0, growing: 0, gathering: 100 } }));
    const g = run(pro, 1).ledgers[0]!.gathered!.find((x: GatherRecord) => x.resource === 'Woody biomass')!;
    expect(g.amount / (g.hours - g.walkHours)).toBeCloseTo(40 * (1 + skillBonus(rule, 'gathering', 100)));
  });

  it('practiced growers raise garden harvests', () => {
    let s = newGame({ 'Human Being': 1, 'Bell Tent': 1, 'Raised Beds (24 sq ft)': 1 }, { settings: { ...ON, startingStocks: supplies } });
    s = withPerson(s, 0, (p) => ({ ...p, skills: { building: 0, growing: 200, gathering: 0 } }));
    const bed = s.instances.find((i) => i.systemId === sysId('Raised Beds (24 sq ft)'))!;
    expect(computeSpatial(catalog, s).get(bed.id)!.outMult['Vegetables fruit fiber herbs']).toBeCloseTo(1 + skillBonus(rule, 'growing', 200));
  });

  it('an ill person does no work until they recover; a well household never falls ill', () => {
    const s = withPerson(home(1), 0, (p) => ({ ...p, condition: { kind: 'ill', daysLeft: 3 } }));
    expect(laborFactor(catalog, s.settings, people(s)[0]!.person!)).toBe(0);
    const r = run(s, 5);
    expect(r.ledgers[0]!.labor.pool).toBe(0);
    expect(r.ledgers[4]!.labor.pool).toBeGreaterThan(0);
    expect(eventsOf(r.events, 'person').map((e) => e.event)).toEqual(['recovered']);
    // Illness only starts on a day that began below 40 wellbeing.
    const one = run(home(1), 200);
    for (const e of eventsOf(one.events, 'person').filter((x) => x.event === 'ill')) {
      const k = one.ledgers.findIndex((l) => l.absDay === e.absDay);
      expect(k > 0 ? one.ledgers[k - 1]!.wellbeing! : 100).toBeLessThan(40);
    }
  });

  it('low wellbeing brings illness; heavy building brings injuries; both use their own random stream', () => {
    const sick = withPerson(withPerson(home(2), 0, (p) => ({ ...p, wellbeing: 5, health: 0.525 })), 1, (p) => ({ ...p, wellbeing: 5, health: 0.525 }));
    const r = run(sick, 60);
    expect(eventsOf(r.events, 'person').some((e) => e.event === 'ill')).toBe(true);
    // Real weather: the household stream never changes the year's weather draws.
    const real = (settings: Partial<GameSettings>) => run(newGame({ 'Human Being': 2, 'Bell Tent': 2 }, { settings: { ...settings, weatherMode: 'real', startingStocks: supplies } }), 400).state.weatherLog;
    expect(real(ON)).toEqual(real({}));
    // A long DIY job: at 0.0005 per hour, a couple of thousand hours brings about one injury.
    const big = newGame({ 'Human Being': 2, 'Bell Tent': 2 }, { settings: { ...ON, emergencyConstruction: true, startingStocks: { ...supplies } } });
    const b = applyAction(catalog, big, { at: 0, kind: 'place', systemId: sysId('Log Cabin Kit'), x: 150, y: 150, mode: 'diy', id: `i${big.nextInstanceId}` });
    const br = run(b, 365);
    const risk = br.ledgers.reduce((a, l) => a + (l.household?.injuryRisk ?? 0), 0);
    expect(risk).toBeGreaterThan(0);
    const injuries = eventsOf(br.events, 'person').filter((e) => e.event === 'injured').length;
    expect(injuries).toBeLessThanOrEqual(Math.ceil(risk * 4) + 1);
  });

  it('the person card reports role, labor, risk and skills from the engine', () => {
    let s = home(2);
    s = setRole(catalog, s, people(s)[1]!.id, 'child');
    s = withPerson(s, 0, (p) => ({ ...p, skills: { building: 150, growing: 0, gathering: 0 }, wellbeing: 20 }));
    const v = householdView(s, catalog, people(s)[1]!.id)!;
    expect(v.role).toBe('child');
    expect(v.needs.value).toBe(0.7);
    expect(systemCard(s, catalog, sysId('Human Being'), people(s)[1]!.id).inputs.find((i) => i.view.resource === 'Food')!.needed.value).toBeCloseTo(14000 * 0.7);
    const a = householdView(s, catalog, people(s)[0]!.id)!;
    expect(a.skills.find((k) => k.kind === 'building')!.bonus.value).toBeCloseTo(0.25);
    expect(a.illnessChance.value).toBeCloseTo(0.02 * (40 - 20) / 40);
    expect(householdView({ ...s, settings: { ...s.settings, householdRoles: false } }, catalog, people(s)[0]!.id)).toBeNull();
    expect(() => setRole(catalog, home(1, {}, {}), people(home(1))[0]!.id, 'child')).toThrow(/disabled/);
  });

  it('with the gate off nothing changes, and roles replay and survive a JSON save', () => {
    const a = run(home(2, {}, {}), 30);
    const b = run(home(2, {}, { householdRoles: false }), 30);
    expect(gameDigest({ ...b.state, settings: a.state.settings })).toBe(gameDigest(a.state));
    expect(a.state.householdRng).toBeUndefined();

    const init = { siteId: 'front-range', seed: 1, settings: { ...ON, startingStocks: supplies } };
    let s = replay(catalog, init, [], 0);
    const actions = [
      { at: 0, kind: 'place' as const, systemId: sysId('Human Being'), x: 30, y: 30, mode: 'prebuilt' as const, id: `i${s.nextInstanceId}` },
      { at: 0, kind: 'place' as const, systemId: sysId('Human Being'), x: 40, y: 30, mode: 'prebuilt' as const, id: `i${s.nextInstanceId + 1}` },
      { at: 0, kind: 'role' as const, id: `i${s.nextInstanceId + 1}`, role: 'child' as const },
    ];
    for (const a of actions) s = applyAction(catalog, s, a);
    s = stepDays(s, catalog, 25).state;
    expect(gameDigest(replay(catalog, init, actions, 25))).toBe(gameDigest(s));
    const loaded = JSON.parse(JSON.stringify(s)) as GameState;
    expect(gameDigest(stepDays(loaded, catalog, 10).state)).toBe(gameDigest(stepDays(s, catalog, 10).state));
  });
});
