import { describe, expect, it } from 'vitest';
import { getSite, getStart } from '@homestead/catalog';
import {
  buyAtMarket, climateTable, constructionView, contractorQuote, dailyAmount, gameDigest, getPlans,
  hireConstruction, laborWeek, workView, placementPreview, projectPreview, refundFor, startGame, stepDay, stepDays,
} from '../src/index.ts';
import { catalog, newGame, place, sysId } from './time-helpers.ts';

const paid = sysId('Remote Job (40 hrs)');

describe('LL-23: employment protects upkeep and respects adults', () => {
  it('three jobs cannot work more than two full-time equivalents, and upkeep keeps its labor', () => {
    const s = newGame({ 'Human Being': 2, 'Remote Job (40 hrs)': 3, 'Humanure Bucket System': 1 }, {
      settings: { employmentPriority: true, wellbeingMult: 0, startingStocks: { Food: 1e7, 'Organic waste': 100, Carbon: 1000 } },
    });
    const r = stepDays(s, catalog, 14);
    for (const l of r.ledgers) {
      expect(l.laborBySystem[paid]).toBeLessThanOrEqual(80 / 7 + 1e-9);
      expect(l.labor.byJob!.upkeep).toBeGreaterThan(0);
      const hours = Object.values(l.labor.byJob!).reduce((a, h) => a + h, 0);
      expect(hours).toBeLessThanOrEqual(l.labor.pool + 1e-9);
    }
    const legacy = stepDays({ ...s, settings: { ...s.settings, employmentPriority: false } }, catalog, 7);
    expect(legacy.ledgers.reduce((a, l) => a + (l.laborBySystem[paid] ?? 0), 0)).toBeGreaterThan(80);
  });

  it('continuation reconciles a week containing both employment ledger formats', () => {
    const s = newGame({ 'Human Being': 2, 'Remote Job (40 hrs)': 1, 'Humanure Bucket System': 1 }, {
      settings: { wellbeingMult: 0, startingStocks: { Food: 1e7, 'Organic waste': 100, Carbon: 1000 } },
    });
    const legacy = stepDays(s, catalog, 3).state;
    const continued = stepDays({ ...legacy, settings: { ...legacy.settings, employmentPriority: true } }, catalog, 3).state;
    const week = laborWeek(continued, catalog);
    const toilet = sysId('Humanure Bucket System');
    const expectedMaintenance = continued.ledgers.reduce((a, l) => a + (l.laborBySystem[toilet] ?? 0), 0);
    expect(week.breakdown.maintenance.value).toBeCloseTo(expectedMaintenance, 9);
    expect(week.breakdown.maintenance.value + week.breakdown.employment.value).toBeCloseTo(week.worked.value, 9);
    const rows = workView(continued, catalog).rows;
    expect(rows.find((r) => r.job === 'employment')!.hoursWeek.value).toBeCloseTo(week.breakdown.employment.value, 9);
    expect(rows.find((r) => r.job === 'upkeep')!.hoursWeek.value).toBeCloseTo(expectedMaintenance, 9);
  });

  it('the employment priority and cap control actual wages; placement warns when upkeep can be displaced', () => {
    const s = newGame({ 'Human Being': 1, 'Remote Job (40 hrs)': 1 }, {
      settings: { employmentPriority: true, work: { caps: { employment: 0 }, priorities: { employment: 1 } } },
    });
    expect(stepDay(s, catalog).ledger.cash.in).toBe(0);
    const v = placementPreview(s, catalog, paid, 80, 80);
    expect(v.warning).toContain('can displace survival upkeep');
    expect(v.warning).toContain('40 h/week');
    const none = newGame({ 'Remote Job (40 hrs)': 1 }, { settings: { employmentPriority: true } });
    expect(stepDay(none, catalog).ledger.cash.in).toBe(0);
  });
});

describe('LL-24: starting support is explicit and replay-gated', () => {
  it.each([1, 2, 4])('%i adults get per-adult cash; legacy starts keep the old cash', (household) => {
    const init = { siteId: 'front-range', seed: 1, start: { id: 'greenfield', difficulty: 'standard' as const, household }, settings: {} };
    const old = startGame(catalog, init);
    const fresh = startGame(catalog, { ...init, settings: { householdStart: true } });
    expect(old.cash).toBe(getStart('greenfield').cash);
    expect(fresh.cash).toBe(8000 * household);
    expect(fresh.instances).toEqual(old.instances);
    expect(fresh.stocks).toEqual(old.stocks);
  });
});

describe('LL-25: crew quotes use site rates and refund the rate actually paid', () => {
  it.each(['front-range', 'laramie-wy', 'asheville-nc'])('%s prices the remaining work, preserving legacy rates', (site) => {
    let s = place(newGame({}, { site, settings: { siteCrewRates: true } }), 'Rocket Mass Heater', 80, 80, 'diy').state;
    const i = s.instances[0]!;
    const quote = contractorQuote(s, i);
    expect(quote.cost).toBe(60 * getSite(site).crewRate!);
    expect(contractorQuote(s, { ...i, setupHoursDone: i.setupHoursNeeded }).days).toBe(1); // zero-hour projects still activate on the next daily step
    expect(contractorQuote({ ...s, settings: { ...s.settings, siteCrewRates: false } }, i).cost).toBe(2100);
    s = stepDays(hireConstruction(s, i.id), catalog, 2).state;
    const partial = s.instances[0]!;
    expect(refundFor(partial)).toBe(i.paid + 44 * quote.rate);
    expect(s.cash).toBe(100000 - i.paid - quote.cost);
  });
});

it('LL-25: a crew quote shows time saved against the household schedule and the heating deadline', () => {
  const s = place(newGame({ 'Human Being': 2 }, { settings: { siteCrewRates: true, startDay: 190, constructionShare: 0.1, startingStocks: { Food: 1e7, 'Drinking water': 1000 } } }), 'Rocket Mass Heater', 80, 80, 'diy').state;
  const q = constructionView(s, catalog)[0]!;
  expect(q.eta).not.toBeNull();
  expect(q.daysGained).toBe(q.eta! - q.quote.days);
  expect(q.daysGained).toBeGreaterThan(0);
  expect(q.coldIn).toBeGreaterThan(0);
});

describe('LL-26: cash purchases stop at zero', () => {
  it('an unaffordable delivery is retained and causes no charge, then arrives once funds exist', () => {
    let s = newGame({}, { settings: { startingCash: 10, cashFloor: true } });
    s = buyAtMarket(catalog, s, 'Woody biomass', 10);
    const stopped = stepDay(s, catalog);
    expect(stopped.state.cash).toBe(10);
    expect(stopped.ledger.spend.delivery).toBe(0);
    expect(stopped.state.market!.orders).toHaveLength(1);
    const funded = stepDay({ ...stopped.state, cash: 100 }, catalog);
    expect(funded.ledger.resources['Woody biomass']!.purchased).toBe(10);
    expect(funded.state.market!.orders).toHaveLength(0);
    expect(stepDay(funded.state, catalog).ledger.resources['Woody biomass']!.purchased).toBe(0);
  });

  it('connection fees and system running costs compete for actual remaining cash without overdrawing', () => {
    const s = newGame({ 'Human Being': 2, 'Average Suburban Home': 1, 'Municipal Water Hookup': 1, 'Central Power Plant (Coal / NatGas / Nuclear)': 1 }, {
      settings: { startingCash: 1, cashFloor: true, startingStocks: { Food: 1e6 } },
    });
    const r = stepDays(s, catalog, 7);
    expect(r.state.cash).toBe(0);
    for (const l of r.ledgers) {
      expect(l.cash.end).toBeGreaterThanOrEqual(0);
      expect(l.cash.end).toBeCloseTo(l.cash.start + l.cash.in - l.cash.out - l.cash.purchases + l.cash.refunds, 9);
    }
    const legacy = stepDays({ ...s, settings: { ...s.settings, cashFloor: false } }, catalog, 7);
    expect(legacy.state.cash).toBeLessThan(0);
  });

  it('rejects an unaffordable build without mutation and still renders its cost preview', () => {
    const s = newGame({}, { settings: { startingCash: 20, cashFloor: true } });
    const before = gameDigest(s);
    expect(() => place(s, 'Yurt', 60, 60, 'diy')).toThrow('Need $');
    expect(gameDigest(s)).toBe(before);
    const preview = projectPreview(s, catalog, sysId('Yurt'), 'diy');
    expect(preview.cashAfter.value).toBeLessThan(0);
    expect(preview.eta).toBeNull();
  });
});

describe('LL-27: verify heater fuel timing before changing the catalog', () => {
  it.each(['front-range', 'laramie-wy', 'asheville-nc'])('%s: rocket heater fuel follows HDD, with the annual catalog total preserved', (site) => {
    const land = getSite(site);
    const climate = climateTable(land);
    const heater = getPlans(catalog, land).bySystem.get(sysId('Rocket Mass Heater'))!;
    const fuel = heater.inputs.find((f) => f.resource === 'Woody biomass')!;
    expect(fuel.shape).toBe('heating');
    const amounts = climate.days.map((weather, day) => dailyAmount(fuel, day, weather, climate));
    for (let day = 0; day < 365; day++) if (climate.days[day]!.hdd === 0) expect(amounts[day]).toBe(0);
    expect(amounts.reduce((a, v) => a + v, 0)).toBeCloseTo(fuel.weekly * 365 / 7, 7);
    const winter = climate.days.findIndex((d) => d.hdd > 0);
    expect(amounts[winter]).toBeGreaterThan(0);
  });

  it('a rocket heater requests no wood in a zero-HDD summer, while a cooking stove still provides cooking fuel', () => {
    const stocks = { Food: 1e6, 'Woody biomass': 10000 };
    const rocket = newGame({ 'Human Being': 1, 'Rocket Mass Heater': 1 }, { settings: { startDay: 190, startingStocks: stocks } });
    expect(stepDay(rocket, catalog).ledger.resources['Woody biomass']!.requested).toBe(0);
    const stove = newGame({ 'Human Being': 1, 'Tiny Wood Stove': 1 }, { settings: { startDay: 190, startingStocks: stocks } });
    const l = stepDay(stove, catalog).ledger;
    expect(l.resources['Woody biomass']!.consumed).toBeGreaterThan(0);
    expect(l.resources['Cooking fuel']!.produced).toBeGreaterThan(0);
    expect(l.resources.Heat!.produced).toBe(0);
  });
});
