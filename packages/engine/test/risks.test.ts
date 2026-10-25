import { describe, expect, it } from 'vitest';
import type { Catalog, RiskKind } from '@homestead/catalog';
import {
  applyAction,
  buyAtMarket,
  computeSpatial,
  gameDigest,
  manageFinance,
  prepareRisks,
  replay,
  riskView,
  serviceSystem,
  smokeExposure,
  startGame,
  stepDays,
  survivalAlerts,
  type Action,
  type GameInit,
  type GameState,
  type RiskThreat,
} from '../src/index.ts';
import { catalog, newGame, sysId } from './time-helpers.ts';

function base(counts: Record<string, number> = {}, settings: Partial<GameState['settings']> = {}): GameState {
  return newGame(counts, {
    settings: {
      riskEvents: true,
      wearAndRepair: true,
      cashFloor: true,
      startingCash: 10000,
      startDay: 170,
      ...settings,
    },
  });
}
function withThreat(s: GameState, kind: RiskKind, targetId?: string, startsAt = 1, days = 4): GameState {
  const threat: RiskThreat = {
    id: `${kind}:test`,
    kind,
    warnedAt: 0,
    startsAt,
    endsAt: startsAt + days,
    ...(targetId ? { targetId } : {}),
  };
  return {
    ...s,
    calendar: { ...s.calendar, absDay: 1 },
    risks: { threats: [threat], readiness: s.risks?.readiness ?? {} },
  };
}
const quiet = {
  ...catalog,
  riskEvents: {
    ...catalog.riskEvents!,
    events: Object.fromEntries(
      Object.entries(catalog.riskEvents!.events).map(([k, v]) => [k, { ...v, chance: 0 }]),
    ),
  },
} as Catalog;
const go = (s: GameState, days = 1) => stepDays(s, quiet, days);
const idOf = (s: GameState, name: string) => s.instances.find((i) => i.systemId === sysId(name))!.id;
const condition = (s: GameState, id: string, value: number) => ({
  ...s,
  instances: s.instances.map((i) => (i.id === id ? { ...i, condition: value } : i)),
});

// Paired simulations share supplies, date, seed and systems. Only the warned event/defense changes.
describe('LL-38 warned risk events', () => {
  it('uses a separate fixed-draw stream and gives full precursor days before any impact', () => {
    const s = base({ 'Raised Beds (24 sq ft)': 1, 'Central Power Plant (Coal / NatGas / Nuclear)': 1 });
    const forced: Catalog = {
      ...catalog,
      riskEvents: {
        ...catalog.riskEvents!,
        events: Object.fromEntries(
          Object.entries(catalog.riskEvents!.events).map(([k, v]) => [k, { ...v, chance: 1 }]),
        ),
      },
    } as Catalog;
    const weather = { hdd: 0, cdd: 5, psh: 5, precipIn: 0, windCf: 0.2, growing: true, tags: [] };
    const p = prepareRisks(forced, s, weather)!;
    expect(p.state.rng).toBe(s.rng);
    expect(p.state.livestockRng).toBe(s.livestockRng);
    expect(p.state.risks.threats.map((t) => t.kind)).toEqual(['pests', 'disease', 'smoke', 'outage']);
    for (const t of p.state.risks.threats)
      expect(t.startsAt - t.warnedAt).toBe(forced.riskEvents!.events[t.kind].warningDays + 1);
    expect(p.events.every((e) => e.kind === 'risk' && e.phase === 'warning')).toBe(true);
    const empty = prepareRisks(forced, { ...s, instances: [] }, weather)!;
    expect(empty.state.riskRng).toBe(p.state.riskRng);
    expect(s.risks).toBeUndefined();
    const grid = s.instances.find(
      (i) => i.systemId === sysId('Central Power Plant (Coal / NatGas / Nuclear)'),
    )!;
    const future = withThreat(s, 'outage', undefined, 4);
    expect(computeSpatial(quiet, future).get(grid.id)!.outMult.Electricity ?? 1).toBe(1);
    expect(
      survivalAlerts(future, quiet).some((a) => a.title.includes('Grid outage warning') && a.days === 3),
    ).toBe(true);
  });

  it('a warned worn asset fails at the deadline, stops producing, and qualifies for LL-37 insurance exactly once', () => {
    let s = base({ 'Bell Tent': 1 }, { finance: true });
    const id = idOf(s, 'Bell Tent');
    s = manageFinance(quiet, condition(s, id, 0.5), 'insurance', 1);
    s = withThreat(s, 'breakdown', id);
    const r = go(s);
    expect(r.state.instances[0]!.condition).toBe(0);
    expect(r.ledgers[0]!.needs.Shelter.provided).toBe(0);
    expect(r.ledgers[0]!.finance!.claim).toBe(440);
    expect(r.events.some((e) => e.kind === 'risk' && e.phase === 'started')).toBe(true);
    expect(go(r.state).ledgers[0]!.finance!.claim).toBe(0);
    expect(s.instances[0]!.condition).toBe(0.5);
  });

  it('repair or replacement during the warning averts failure, including work still in progress', () => {
    let s = base({ 'Bell Tent': 1 });
    const id = idOf(s, 'Bell Tent');
    s = withThreat(condition(s, id, 0.5), 'breakdown', id, 3);
    s = serviceSystem(quiet, s, id);
    const r = go(s, 3);
    expect(r.events.some((e) => e.kind === 'risk' && e.phase === 'averted')).toBe(true);
    expect(r.state.instances[0]!.status).toBe('building');
    expect(r.state.risks!.threats).toHaveLength(0);
    expect(r.state.instances[0]!.condition).toBeGreaterThan(0);
  });

  it.each(['pests', 'disease'] as const)(
    '%s reduces only the targeted garden; an operating nearby defense softens the loss',
    (kind) => {
      let s = base(
        { 'Raised Beds (24 sq ft)': 2, [kind === 'pests' ? 'Bat House' : 'Compost Piles']: 1 },
        { unlimitedSupply: true },
      );
      const gardens = s.instances.filter((i) => i.systemId === sysId('Raised Beds (24 sq ft)'));
      const defense = s.instances.find((i) => !gardens.includes(i))!;
      s = {
        ...s,
        instances: s.instances.map((i) =>
          i.id === defense.id ? { ...i, x: gardens[0]!.x + 10, y: gardens[0]!.y } : i,
        ),
      };
      s = withThreat(s, kind, gardens[0]!.id);
      const unprotected = computeSpatial(quiet, s);
      expect(unprotected.get(gardens[0]!.id)!.outMult['Vegetables fruit fiber herbs']).toBe(0.5);
      expect(unprotected.get(gardens[1]!.id)!.outMult['Vegetables fruit fiber herbs'] ?? 1).toBe(1);
      const protectedState = { ...s, risks: { ...s.risks!, readiness: { [defense.id]: 1 } } };
      expect(
        computeSpatial(quiet, protectedState).get(gardens[0]!.id)!.outMult['Vegetables fruit fiber herbs'],
      ).toBe(0.85);
      const bare = go(s).ledgers[0]!.resources['Vegetables fruit fiber herbs']!.produced;
      const sheltered = go(protectedState).ledgers[0]!.resources['Vegetables fruit fiber herbs']!.produced;
      expect(sheltered).toBeGreaterThan(bare);
      expect(go(s, 2).ledgers[1]!.resources['Vegetables fruit fiber herbs']!.produced).toBeGreaterThan(bare);
      expect(
        computeSpatial(quiet, {
          ...protectedState,
          instances: protectedState.instances.map((i) => (i.id === defense.id ? { ...i, x: i.x + 500 } : i)),
        }).get(gardens[0]!.id)!.outMult['Vegetables fruit fiber herbs'],
      ).toBe(0.5);
      const recovered = go(s, 5).state;
      expect(
        computeSpatial(quiet, recovered).get(gardens[0]!.id)!.outMult['Vegetables fruit fiber herbs'] ?? 1,
      ).toBe(1);
    },
  );

  it('unfunded, partial-scale or unfinished defenses cannot prevent harvest loss', () => {
    let s = base({ 'Raised Beds (24 sq ft)': 1, 'Bat House': 1 });
    const garden = idOf(s, 'Raised Beds (24 sq ft)');
    const defender = idOf(s, 'Bat House');
    s = withThreat(s, 'pests', garden);
    for (const patch of [{ status: 'building' as const }, { scale: 0.01 }, {}]) {
      const altered = {
        ...s,
        instances: s.instances.map((i) => (i.id === defender ? { ...i, ...patch } : i)),
        risks: { ...s.risks!, readiness: { [defender]: Object.keys(patch).length ? 1 : 0.2 } },
      };
      expect(computeSpatial(quiet, altered).get(garden)!.outMult['Vegetables fruit fiber herbs']).toBe(0.5);
    }
  });

  it('smoke adds cooling demand and an air-quality wellbeing loss; enclosed operating refuge reduces exposure within capacity', () => {
    let s = base({ 'Human Being': 2, 'Average Suburban Home': 1 }, { unlimitedSupply: true });
    const home = idOf(s, 'Average Suburban Home');
    s = withThreat(s, 'smoke');
    const person = s.instances.find((i) => i.person)!;
    expect(smokeExposure(quiet, s, person)).toBe(1.5);
    const protectedState = { ...s, risks: { ...s.risks!, readiness: { [home]: 1 } } };
    expect(smokeExposure(quiet, protectedState, person)).toBe(0.375);
    const uncovered = go(s);
    const covered = go(protectedState);
    const calm = go({ ...s, risks: { ...s.risks!, threats: [] } });
    expect(uncovered.ledgers[0]!.weather.cdd).toBe(calm.ledgers[0]!.weather.cdd + 8);
    expect(uncovered.ledgers[0]!.needs['Cooled shelter'].needed).toBeGreaterThan(
      calm.ledgers[0]!.needs['Cooled shelter'].needed,
    );
    expect(covered.state.instances.find((i) => i.person)!.person!.wellbeing).toBeGreaterThan(
      uncovered.state.instances.find((i) => i.person)!.person!.wellbeing,
    );
    expect(
      uncovered.state.instances
        .find((i) => i.person)!
        .person!.why.some((w) => w.label.includes('air exposure')),
    ).toBe(true);
    expect(
      smokeExposure(
        quiet,
        {
          ...protectedState,
          instances: protectedState.instances.map((i) => (i.id === home ? { ...i, shelterClosed: true } : i)),
        },
        person,
      ),
    ).toBe(1.5);
  });

  it('smoke refuge respects living-space capacity and per-person shelter assignments', () => {
    let s = base(
      { 'Human Being': 2, 'Average Suburban Home': 1, 'Bell Tent': 1 },
      { shelterOccupancy: true, unlimitedSupply: true },
    );
    const people = s.instances.filter((i) => i.person);
    const house = idOf(s, 'Average Suburban Home');
    const tent = idOf(s, 'Bell Tent');
    s = applyAction(quiet, s, { at: 0, kind: 'assignShelter', id: people[0]!.id, shelterId: house });
    s = applyAction(quiet, s, { at: 0, kind: 'assignShelter', id: people[1]!.id, shelterId: tent });
    s = withThreat(s, 'smoke');
    s = { ...s, risks: { ...s.risks!, readiness: { [house]: 1, [tent]: 1 } } };
    expect(smokeExposure(quiet, s, people[0]!)).toBe(0.375);
    expect(smokeExposure(quiet, s, people[1]!)).toBe(1.5);
    const crowded = {
      ...s,
      instances: s.instances.map((i) => (i.id === people[0]!.id ? { ...i, scale: 20 } : i)),
    };
    expect(
      smokeExposure(
        quiet,
        crowded,
        crowded.instances.find((i) => i.id === people[0]!.id)!,
      ),
    ).toBeGreaterThan(0.375);
    const broken = condition(s, house, 0);
    expect(smokeExposure(quiet, broken, people[0]!)).toBe(1.5);
  });

  it('eligibility follows season, cold and drought while weather and predator random streams remain unchanged over two years', () => {
    const s = base({ Well: 1 });
    const forced: Catalog = {
      ...catalog,
      riskEvents: {
        ...catalog.riskEvents!,
        events: Object.fromEntries(
          Object.entries(catalog.riskEvents!.events).map(([k, v]) => [k, { ...v, chance: 1 }]),
        ),
      },
    } as Catalog;
    const weather = { hdd: 40, cdd: 0, psh: 4, precipIn: 0, windCf: 0.2, growing: true, tags: [] };
    const dry = {
      year: 0,
      precipMult: 0.6,
      hddMult: 1,
      cddMult: 1,
      lateFrostDays: 0,
      heatWaves: [],
      hailDay: null,
    };
    expect(
      prepareRisks(forced, s, weather, dry)!.state.risks.threats.some((t) => t.kind === 'drawdown'),
    ).toBe(true);
    expect(
      prepareRisks(forced, s, weather, { ...dry, precipMult: 1 })!.state.risks.threats.some(
        (t) => t.kind === 'drawdown',
      ),
    ).toBe(false);
    const winter = prepareRisks(
      forced,
      { ...s, calendar: { ...s.calendar, day: 0 } },
      { ...weather, growing: false },
      dry,
    )!;
    expect(winter.state.risks.threats.map((t) => t.kind)).toEqual(['blizzard']);
    const real = base({}, { weatherMode: 'real' });
    const on = stepDays(real, catalog, 730).state;
    const off = stepDays({ ...real, settings: { ...real.settings, riskEvents: false } }, catalog, 730).state;
    expect(on.rng).toBe(off.rng);
    expect(on.weatherLog).toEqual(off.weatherLog);
  });

  it('blizzard pauses market and grocery deliveries without charges, lost orders or repeated standing top-ups; reserves still feed residents', () => {
    let s = base({ 'Human Being': 1, 'Big Box Grocery Store': 1 }, { startingStocks: { Food: 20000 } });
    s = buyAtMarket(quiet, s, 'Woody biomass', 10);
    s = withThreat(s, 'blizzard', undefined, 1, 3);
    const before = s.cash;
    const r = go(s, 3);
    expect(r.state.market!.orders).toHaveLength(1);
    expect(r.state.market!.orders[0]!.amount).toBe(10);
    expect(
      r.ledgers.every(
        (l) =>
          l.spend.delivery === 0 &&
          (l.resources['Woody biomass']?.purchased ?? 0) === 0 &&
          (l.spend.backstop.Food ?? 0) === 0,
      ),
    ).toBe(true);
    expect(r.ledgers.every((l) => l.needs.Food.delivered > 0)).toBe(true);
    expect(r.state.cash).toBe(before);
    const arrived = go(r.state);
    expect(arrived.state.market!.orders).toHaveLength(0);
    expect(arrived.ledgers[0]!.resources['Woody biomass']!.purchased).toBe(10);
  });

  it('a grid outage blocks real backstop electricity; independent generation supplies loads during the outage', () => {
    const s = base({
      'Human Being': 1,
      'Central Power Plant (Coal / NatGas / Nuclear)': 1,
      'Pedal Power Generator': 1,
    });
    const storm = withThreat(s, 'outage');
    const r = go(storm);
    expect(r.ledgers[0]!.spend.backstop.Electricity ?? 0).toBe(0);
    expect(r.ledgers[0]!.resources.Electricity!.purchased).toBe(0);
    expect(r.ledgers[0]!.resources.Electricity!.produced).toBeGreaterThan(0);
    expect(
      go({
        ...storm,
        instances: storm.instances.filter((i) => i.systemId !== sysId('Pedal Power Generator')),
      }).ledgers[0]!.resources.Electricity!.produced,
    ).toBe(0);
    expect(
      go({ ...s, calendar: storm.calendar }).ledgers[0]!.resources.Electricity!.purchased,
    ).toBeGreaterThan(0);
  });

  it('well drawdown lowers both powered and hand-pumped wells while stored and rain water remain available', () => {
    let s = base(
      { Well: 1, 'Hand Pump Well': 1, 'Rainwater Collection System + Cistern (550 Gallons)': 1 },
      { unlimitedSupply: true },
    );
    s = withThreat(s, 'drawdown');
    const sp = computeSpatial(quiet, s);
    for (const name of ['Well', 'Hand Pump Well']) expect(sp.get(idOf(s, name))!.outMult.Water).toBe(0.35);
    expect(sp.get(idOf(s, 'Rainwater Collection System + Cistern (550 Gallons)'))!.outMult.Water ?? 1).toBe(
      1,
    );
    expect(go(s).ledgers[0]!.resources.Water!.produced).toBeLessThan(
      go({ ...s, risks: { ...s.risks!, threats: [] } }).ledgers[0]!.resources.Water!.produced,
    );
  });

  it('existing predator warnings are surfaced with housing/guardian mitigation and no extra predator draws', () => {
    let s = base({ 'Baby Chicks': 1 }, { livestockLifecycle: true });
    s = {
      ...s,
      instances: s.instances.map((i) => ({
        ...i,
        animal: { ageDays: 1, growthDays: 1, predatorWarning: { daysLeft: 3 } },
      })),
    };
    expect(riskView(s, quiet).find((r) => r.id.startsWith('predator:'))!.detail).toContain(
      'Livestock Guardian Dog',
    );
    const legacy = go({ ...s, settings: { ...s.settings, riskEvents: false } });
    const enabled = go(s);
    expect(enabled.state.livestockRng).toBe(legacy.state.livestockRng);
    expect(enabled.ledgers[0]!.livestock).toEqual(legacy.ledgers[0]!.livestock);
  });

  it('off-gate games have no risk state, toggling off clears pending effects, and replay/JSON continuation preserve warnings and draws', () => {
    const init: GameInit = {
      siteId: 'front-range',
      seed: 38,
      settings: { startingCash: 10000, startDay: 170 },
    };
    const off = startGame(quiet, init);
    expect(go(off, 30).state.risks).toBeUndefined();
    const actions: Action[] = [{ at: 0, kind: 'settings', settings: { riskEvents: true } }];
    const enabled = applyAction(quiet, off, actions[0]!);
    const forced: Catalog = {
      ...quiet,
      riskEvents: {
        ...quiet.riskEvents!,
        events: { ...quiet.riskEvents!.events, smoke: { ...quiet.riskEvents!.events.smoke, chance: 1 } },
      },
    };
    const live = stepDays(enabled, forced, 2).state;
    expect(live.risks!.threats).toHaveLength(1);
    expect(live.risks!.threats[0]!.startsAt).toBeGreaterThan(live.calendar.absDay);
    expect(gameDigest(live)).toBe(gameDigest(replay(forced, init, actions, 2)));
    const clone = JSON.parse(JSON.stringify(live)) as GameState;
    expect(gameDigest(stepDays(clone, forced, 60).state)).toBe(gameDigest(replay(forced, init, actions, 62)));
    const active = stepDays(live, forced, 3).state;
    expect(active.ledgers.at(-1)!.risks!.some((t) => t.kind === 'smoke')).toBe(true);
    const activeClone = JSON.parse(JSON.stringify(active)) as GameState;
    expect(gameDigest(stepDays(activeClone, forced, 10).state)).toBe(
      gameDigest(replay(forced, init, actions, 15)),
    );
    const paused = applyAction(quiet, withThreat(live, 'smoke'), {
      at: live.calendar.absDay,
      kind: 'settings',
      settings: { riskEvents: false },
    });
    expect(paused.risks).toBeUndefined();
    expect(riskView(paused, quiet)).toEqual([]);
    expect(go(paused).state.riskRng).toBe(paused.riskRng);
    expect(gameDigest(live)).not.toBe(gameDigest({ ...live, riskRng: 7 }));
  });
});
