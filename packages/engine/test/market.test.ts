import { describe, expect, it } from 'vitest';
import {
  applyAction,
  buyAtMarket,
  gameDigest,
  replay,
  setStandingOrder,
  stepDays,
  summarizeLedgers,
  weeklyBills,
  type DayLedger,
  type GameState,
} from '../src/index.ts';
import { advanceTo, catalog, newGame, run, sysId } from './time-helpers.ts';

const FOOD_PRICE = 0.0065;
const POWER_PRICE = 0.15;

/** An adapt-style household: a house, two cars, and the grocery, grid, and city water as backstops. */
function adaptHome(extra: Record<string, number> = {}, settings: Partial<GameState['settings']> = {}) {
  return newGame(
    {
      'Human Being': 2,
      'Average Suburban Home': 1,
      'Big Box Grocery Store': 1,
      'Central Power Plant (Coal / NatGas / Nuclear)': 1,
      'Municipal Water Hookup': 1,
      'Average American Vehicle': 2,
      'Gas Station': 1,
      Sunlight: 1,
      ...extra,
    },
    { settings: { startingCash: 50_000, startingStocks: {}, ...settings } },
  );
}

const total = (ls: DayLedger[], f: (l: DayLedger) => number) => ls.reduce((a, l) => a + f(l), 0);
const spent = (ls: DayLedger[], kind: 'backstop' | 'market', r: string) => total(ls, (l) => l.spend[kind][r] ?? 0);

describe('backstops fill what the homestead does not', () => {
  it('a house with grocery and grid backstops is fully fed and powered, at full price', () => {
    const { ledgers } = run(adaptHome(), 15);
    const days = ledgers.slice(1);
    const s = summarizeLedgers(days, catalog);
    for (const need of ['Food', 'Electricity'] as const) expect(s.checklist.find((r) => r.need === need)!.pct).toBeCloseTo(1, 9);
    const food = total(days, (l) => l.resources['Food']!.purchased);
    expect(spent(days, 'backstop', 'Food')).toBeCloseTo(food * FOOD_PRICE, 9);
    const power = total(days, (l) => l.resources['Electricity']!.purchased);
    expect(spent(days, 'backstop', 'Electricity')).toBeCloseTo(power * POWER_PRICE, 9);
    // Self-reliance is near zero: everything is bought.
    expect(s.selfReliance).toBeLessThan(0.1);
  });

  it('four raised beds and a 6 kW array cut the grocery and power bills by exactly what they supplied', () => {
    const settings = { startingStocks: { Seeds: 50, Compost: 2000 } };
    const days = 21;
    const a = run(advanceTo(adaptHome({}, settings), 170), days).ledgers.slice(2);
    const b = run(
      advanceTo(adaptHome({ 'Raised Beds (24 sq ft)': 4, 'Rooftop Solar Array (6 kW)': 1 }, settings), 170),
      days,
    ).ledgers.slice(2);
    // On-site supply used = consumed − bought in (vegetables in kcal; electricity in kWh).
    const veg = catalog.resources.find((r) => r.name === 'Vegetables fruit fiber herbs')!;
    const vegEaten = total(b, (l) => l.resources[veg.name]!.consumed) * veg.factorToNeed!;
    expect(vegEaten).toBeGreaterThan(0);
    const foodSaved = spent(a, 'backstop', 'Food') - spent(b, 'backstop', 'Food');
    expect(Math.abs(foodSaved - vegEaten * FOOD_PRICE)).toBeLessThan(0.005);
    const solarUsed = total(b, (l) => l.resources['Electricity']!.consumed - l.resources['Electricity']!.purchased);
    expect(solarUsed).toBeGreaterThan(0);
    const powerSaved = spent(a, 'backstop', 'Electricity') - spent(b, 'backstop', 'Electricity');
    expect(Math.abs(powerSaved - solarUsed * POWER_PRICE)).toBeLessThan(0.005);
  });

  it('when cash runs out, every purchase stops and the almanac says so', () => {
    const { ledgers, events } = run(adaptHome({}, { startingCash: 40 }), 10);
    const stopped = events.filter((e) => e.kind === 'purchases-stopped');
    expect(stopped).toHaveLength(1);
    const after = ledgers.filter((l) => l.absDay > stopped[0]!.absDay + 1);
    expect(after.length).toBeGreaterThan(3);
    for (const l of after) {
      expect(Object.values(l.spend.backstop).reduce((x, y) => x + y, 0)).toBe(0);
      expect(Object.values(l.resources).every((r) => r.purchased === 0)).toBe(true);
    }
  });

  it('connection fees are charged whether the hookup is used or not', () => {
    const g = newGame({ 'Municipal Water Hookup': 1 }, { settings: { startingCash: 1000, startingStocks: {} } });
    const { ledgers } = run(g, 7);
    expect(total(ledgers, (l) => l.spend.fees)).toBeCloseTo(5, 9);
    expect(total(ledgers, (l) => l.spend.backstop['Water'] ?? 0)).toBe(0);
  });

  it('the bills view adds up the week, running costs included (house, cars), and its trend', () => {
    const r = run(adaptHome(), 30);
    const b = weeklyBills(r.state, catalog);
    const week = r.ledgers.slice(-7);
    const expected = total(
      week,
      (l) =>
        Object.values(l.spend.backstop).reduce((x, y) => x + y, 0) +
        l.spend.fees +
        l.spend.delivery +
        Object.values(l.spend.running ?? {}).reduce((x, y) => x + y, 0),
    );
    expect(b.thisWeek.value).toBeCloseTo(expected, 9);
    expect(b.lines.some((l) => l.kind === 'running' && l.item === 'Average Suburban Home')).toBe(true);
    expect(b.thisWeek.value).toBeCloseTo(expected, 9);
    expect(b.lines.find((l) => l.item === 'Food')!.weeks.length).toBe(b.weeks.length);
  });
});

describe('the market', () => {
  it('buy now arrives the next morning; a trip uses 10 miles of transport, or costs $25 without it', () => {
    let g = newGame({ 'Human Being': 1 }, { settings: { startingCash: 500, startingStocks: { Food: 28000 } } });
    g = buyAtMarket(catalog, g, 'Woody biomass', 200);
    const { ledgers, state } = run(g, 1);
    expect(ledgers[0]!.resources['Woody biomass']!.purchased).toBe(200);
    expect(state.stocks['Woody biomass']).toBe(200);
    expect(ledgers[0]!.spend.market['Woody biomass']).toBeCloseTo(20, 9);
    expect(ledgers[0]!.spend.delivery).toBe(25); // nobody here has transport
    expect(state.cash).toBeCloseTo(500 - 20 - 25, 9);
    expect(state.market!.orders).toHaveLength(0);
  });

  it('a standing order keeps firewood above its threshold', () => {
    let g = newGame(
      { 'Human Being': 1, 'Bell Tent': 1, 'Tiny Wood Stove': 1, 'Cargo Bike': 1 },
      { settings: { startingCash: 5000, startingStocks: { Food: 60000, 'Woody biomass': 100 } } },
    );
    g = setStandingOrder(catalog, g, 'Woody biomass', 150, 400);
    const { ledgers } = run(g, 20); // January: the stove burns wood every day
    const trips = ledgers.filter((l) => (l.resources['Woody biomass']?.purchased ?? 0) > 0);
    expect(trips.length).toBeGreaterThan(0);
    for (const l of ledgers.slice(1)) expect(l.resources['Woody biomass']!.start).toBeGreaterThan(0);
  });

  it('electricity is not sold at the market', () => {
    expect(() => buyAtMarket(catalog, newGame({}), 'Electricity', 10)).toThrow(/doesn't sell Electricity/);
  });

  it('market actions replay to the same game', () => {
    const init = { siteId: 'front-range', seed: 3, settings: { startingCash: 1000 } };
    const actions = [
      { at: 0, kind: 'buy' as const, resource: 'Compost', amount: 100 },
      { at: 2, kind: 'standing' as const, resource: 'Drinking water', keepAbove: 10, orderUpTo: 20 },
    ];
    const a = replay(catalog, init, actions, 10);
    const b = stepDays(applyAction(catalog, stepDays(applyAction(catalog, replay(catalog, init, [], 0), actions[0]!), catalog, 2).state, actions[1]!), catalog, 8).state;
    expect(gameDigest(a)).toBe(gameDigest(b));
    expect(a.market!.standing).toEqual([{ resource: 'Drinking water', keepAbove: 10, orderUpTo: 20 }]);
  });
});

describe('backstops in balance mode', () => {
  it('the average year sees the grocery fill the food gap and prices the weekly bill', async () => {
    const { balanceFeasible, designForGame } = await import('../src/index.ts');
    const g = adaptHome();
    const r = balanceFeasible(catalog, g.site.assumptions, designForGame(g, catalog));
    expect(r.checklist.find((x) => x.need === 'Food')!.pct.value).toBeCloseTo(1, 9);
    const grocery = r.backstops.delivered[sysId('Big Box Grocery Store')]!.Food!;
    expect(grocery).toBeCloseTo(28000, 6);
    expect(r.backstops.bills.Food).toBeCloseTo(28000 * FOOD_PRICE, 6);
    expect(r.selfReliance.value).toBeLessThan(0.1);
  });
});
