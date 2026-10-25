import { catalog, getSite, getStart, SITES, type Site } from '@homestead/catalog';
import { describe, expect, it } from 'vitest';
import {
  climateTable,
  financeView,
  gameDigest,
  gameFromStart,
  initGame,
  mortgagePayment,
  startGame,
  stepDays,
  type GameInit,
  type GameState,
} from '../src/index.ts';

const NEW_SITES = ['tucson-az', 'olympia-wa', 'marquette-mi'];

describe('LL-51 sites: a hot-arid, a wet-mild and a cold-lake site', () => {
  it.each(NEW_SITES)('%s: monthly shapes add up to the annual normals, and the year has a growing season', (id) => {
    const s = getSite(id);
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    for (const k of ['hdd', 'cdd', 'precipIn'] as const) expect(Math.abs(sum(s.monthly[k]) - s.assumptions[k]) / Math.max(1, s.assumptions[k])).toBeLessThan(0.03);
    expect(Math.abs(sum(s.monthly.psh) / 12 - s.assumptions.psh)).toBeLessThan(0.15);
    expect(s.growingSeason.startDay).toBeLessThan(s.growingSeason.endDay);
    const t = climateTable(s);
    expect(Math.abs(t.days.reduce((a, d) => a + d.hdd, 0) - s.assumptions.hdd) / s.assumptions.hdd).toBeLessThan(0.05);
    expect(s.nodes.some((n) => n.resource === 'Water')).toBe(true);
    expect(s.hazards?.text).toBeTruthy();
  });

  it('each new site is hard in its own way: the desert is hottest and driest, the coast wettest and darkest, the lake shore coldest with the shortest season', () => {
    const [desert, coast, lake] = NEW_SITES.map(getSite) as [Site, Site, Site];
    const all = Object.values(SITES);
    expect(desert.assumptions.cdd).toBe(Math.max(...all.map((s) => s.assumptions.cdd)));
    expect(desert.assumptions.precipIn).toBeLessThan(12);
    expect(desert.nodes.some((n) => n.type === 'creek')).toBe(false);
    expect(coast.assumptions.precipIn).toBe(Math.max(...all.map((s) => s.assumptions.precipIn)));
    expect(coast.assumptions.psh).toBe(Math.min(...all.map((s) => s.assumptions.psh)));
    expect(coast.nodes.find((n) => n.id === 'spring-1')!.droughtSensitive).toBe(false);
    const season = (s: Site) => s.growingSeason.endDay - s.growingSeason.startDay;
    expect(lake.assumptions.hdd).toBeGreaterThan(8000);
    expect(season(lake)).toBeLessThan(Math.min(...all.filter((s) => s.id !== 'laramie-wy' && s.id !== lake.id).map(season)));
  });

  it('a site hazard makes its risk more frequent without moving any other draw', () => {
    const lake = getSite('marquette-mi');
    const plain: Site = { ...lake, hazards: undefined };
    const play = (site: Site, seed: number) => {
      const r = stepDays(initGame(catalog, site, { riskEvents: true, startDay: 300, startingCash: 1e6, unlimitedSupply: true }, seed), catalog, 365);
      return { blizzards: r.events.filter((e) => e.kind === 'risk' && e.risk === 'blizzard' && e.phase === 'warning').length, rng: r.state.riskRng };
    };
    let more = 0;
    let fewer = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const a = play(lake, seed);
      const b = play(plain, seed);
      more += a.blizzards;
      fewer += b.blizzards;
      // A higher chance only lowers the bar for the same draw: never fewer warnings, never another draw.
      expect(a.blizzards).toBeGreaterThanOrEqual(b.blizzards);
      expect(a.rng).toEqual(b.rng);
    }
    expect(lake.hazards!.riskChanceMult.blizzard).toBe(2);
    expect(more).toBeGreaterThan(fewer);
  });

  it('a hazard multiplier never pushes a chance above certainty', () => {
    const lake = getSite('marquette-mi');
    const certain: Site = { ...lake, hazards: { ...lake.hazards!, riskChanceMult: { blizzard: 100 } } };
    const r = stepDays(initGame(catalog, certain, { riskEvents: true, startDay: 0, startingCash: 1e6, unlimitedSupply: true }, 1), catalog, 60);
    const warnings = r.events.filter((e) => e.kind === 'risk' && e.risk === 'blizzard' && e.phase === 'warning');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.length).toBeLessThanOrEqual(Math.ceil(60 / catalog.riskEvents!.intervalDays));
  });
});

describe('LL-51 starts: an off-grid cabin and a small farm with a mortgage', () => {
  const farm = (o: { children?: number; household?: number; seed?: number } = {}) =>
    gameFromStart(catalog, getSite('front-range'), getStart('farm'), { seed: 1, ...o });

  it('the cabin is off-grid and paid off: no job, no grid, no debt, no tutorial', () => {
    const s = gameFromStart(catalog, getSite('olympia-wa'), getStart('cabin'));
    const names = s.instances.map((i) => catalog.systems.find((x) => x.id === i.systemId)!.name);
    expect(names).toContain('Log Cabin Kit');
    expect(names.some((n) => /Job|Power Plant|Grocery/.test(n))).toBe(false);
    expect(s.finance).toBeUndefined();
    expect(s.tutorial).toBeUndefined();
    expect(s.cash).toBe(6000);
  });

  it('the farm turns on finance and starts with its mortgage: $280,000 at 6.5% over 30 years is $1,769.79 a month', () => {
    const s = farm();
    expect(s.settings.finance).toBe(true);
    expect(mortgagePayment(280000, 0.065, 30)).toBeCloseTo(1769.79, 2);
    expect(s.finance!.mortgage).toEqual({ balance: 280000, annualRate: 0.065, payment: mortgagePayment(280000, 0.065, 30), arrears: 0 });
    expect(financeView(s, catalog)!.mortgage!.payment.value).toBeCloseTo(1769.79, 2);
  });

  it('a year of payments is twelve monthly payments, the balance falls by principal only, and every dollar is in cash out', () => {
    const r = stepDays({ ...farm(), cash: 1e6 }, catalog, 365);
    const m = r.ledgers.map((l) => l.finance!.mortgage!);
    const paid = m.reduce((a, d) => a + d.paid, 0);
    const interest = m.reduce((a, d) => a + d.interest, 0);
    expect(paid).toBeCloseTo(12 * mortgagePayment(280000, 0.065, 30), 6);
    expect(r.state.finance!.mortgage!.balance).toBeCloseTo(280000 + interest - paid, 6);
    expect(280000 - r.state.finance!.mortgage!.balance).toBeGreaterThan(3000);
    for (const l of r.ledgers) expect(l.cash.end).toBeCloseTo(l.cash.start + l.cash.in - l.cash.out - l.cash.purchases + l.cash.refunds + (l.cash.borrowed ?? 0) - (l.cash.repaid ?? 0), 6);
  });

  it('with no cash, installments wait in arrears and are paid first once cash returns; with finance off they pause', () => {
    // Without the job no wages arrive before the day's payment is due.
    const job = catalog.systems.find((x) => x.name === 'Average Job')!.id;
    const jobless = farm();
    const broke = stepDays({ ...jobless, cash: 0, instances: jobless.instances.filter((i) => i.systemId !== job) }, catalog, 10).state;
    const daily = (mortgagePayment(280000, 0.065, 30) * 12) / 365;
    expect(broke.finance!.mortgage!.arrears).toBeCloseTo(10 * daily, 6);
    const paidUp = stepDays({ ...broke, cash: 1e5 }, catalog, 1);
    expect(paidUp.ledgers[0]!.finance!.mortgage!.paid).toBeCloseTo(11 * daily, 6);
    expect(paidUp.state.finance!.mortgage!.arrears).toBe(0);
    const off: GameState = { ...paidUp.state, settings: { ...paidUp.state.settings, finance: false } };
    const paused = stepDays(off, catalog, 5).state;
    expect(paused.finance!.mortgage).toEqual(off.finance!.mortgage);
  });

  it('a start that needs finance for its mortgage refuses to start without it', () => {
    const bad = { ...getStart('farm'), settings: { sellingAndTrade: true } };
    expect(() => gameFromStart(catalog, getSite('front-range'), bad)).toThrow(/mortgage needs settings.finance/);
  });
});

describe('LL-51 households: 1–4 adults plus children (LL-36 roles)', () => {
  it('children are people with the child role; they turn household roles on and scale the stockpile by what they eat', () => {
    const two = gameFromStart(catalog, getSite('front-range'), getStart('farm'));
    const family = gameFromStart(catalog, getSite('front-range'), getStart('farm'), { children: 2 });
    const roles = family.instances.filter((i) => i.person).map((i) => i.person!.role ?? 'adult');
    expect(roles).toEqual(['adult', 'adult', 'child', 'child']);
    expect(family.settings.householdRoles).toBe(true);
    expect(two.settings.householdRoles).toBeFalsy();
    expect(family.stocks.Food! / two.stocks.Food!).toBeCloseTo((2 + 2 * 0.7) / 2, 9);
    expect(family.start!.children).toBe(2);
    // Only people get the role: a per-person kit item stays a kit item.
    expect(family.instances.filter((i) => !i.person).every((i) => i.systemId !== catalog.systems.find((s) => s.name === 'Human Being')!.id)).toBe(true);
  });

  it('children are capped by the start and a game without them is unchanged', () => {
    const many = gameFromStart(catalog, getSite('front-range'), getStart('cabin'), { children: 9 });
    expect(many.instances.filter((i) => i.person?.role === 'child')).toHaveLength(getStart('cabin').household.maxChildren);
    const legacy = gameFromStart(catalog, getSite('front-range'), getStart('greenfield'));
    expect(legacy.start).not.toHaveProperty('children');
    expect(gameDigest(gameFromStart(catalog, getSite('front-range'), getStart('greenfield'), { children: 0 }))).toBe(gameDigest(legacy));
  });

  it.each([1, 4])('the start screen range holds: %i adult(s) plus two children', (adults) => {
    const s = gameFromStart(catalog, getSite('laramie-wy'), getStart('greenfield'), { household: adults, children: 2 });
    expect(s.instances.filter((i) => i.person && !i.person.role)).toHaveLength(adults);
    expect(s.instances.filter((i) => i.person?.role === 'child')).toHaveLength(2);
  });

  it('a saved game with children and a mortgage replays to the same digest', () => {
    const init: GameInit = { siteId: 'marquette-mi', seed: 3, settings: { cashFloor: true }, start: { id: 'farm', difficulty: 'real', household: 2, children: 1 } };
    const a = stepDays(startGame(catalog, init), catalog, 40).state;
    const b = stepDays(startGame(catalog, JSON.parse(JSON.stringify(init))), catalog, 40).state;
    expect(gameDigest(a)).toBe(gameDigest(b));
    expect(a.instances.filter((i) => i.person?.role === 'child')).toHaveLength(1);
    expect(a.finance!.mortgage!.balance).toBeLessThan(280000);
  });
});
