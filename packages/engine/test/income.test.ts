import { describe, expect, it } from 'vitest';
import { getQuestLine, getSite } from '@homestead/catalog';
import {
  applyAction,
  climateTable,
  csaView,
  gameDigest,
  newTutorial,
  queueTrade,
  replay,
  startGame,
  stepDay,
  stepDays,
  weeklyBills,
  type GameSettings,
  type GameState,
} from '../src/index.ts';
import { catalog, newGame, sysId } from './time-helpers.ts';

const csa = 'CSA Share Program (4 half shares)';
const spinning = 'Spinning Wheel and Loom';
const VEG = 'Vegetables fruit fiber herbs';
const rule = catalog.incomeTrade!;
const supplies = { Food: 1e7, 'Drinking water': 1000 };
/** Front Range, late June: inside the growing season. */
const SUMMER = 172;
/** A full growing-season week's promise: the weekly $45 spread over the season (growing-season flow). */
const WEEK = 45 * (365 / climateTable(getSite('front-range')).seasonDays);
const of = (s: GameState, name: string) => s.instances.find((i) => i.systemId === sysId(name))!;
const finishTutorial = (s: GameState): GameState => ({
  ...s,
  tutorial: { ...newTutorial('greenfield', 0), current: getQuestLine('greenfield').quests.length },
});

function farm(counts: Record<string, number>, stocks: Record<string, number> = {}, settings: Partial<GameSettings> = {}) {
  return newGame(
    { 'Human Being': 1, 'Root Cellar': 1, ...counts },
    {
      settings: {
        sellingAndTrade: true,
        wellbeingMult: 0,
        startDay: SUMMER,
        startingCash: 1000,
        startingStocks: { ...supplies, ...stocks },
        ...settings,
      },
    },
  );
}

describe('LL-46 CSA shares', () => {
  it('a fully packed growing-season week earns the share price with no make-good', () => {
    const r = stepDays(farm({ [csa]: 1 }, { [VEG]: 200 }), catalog, 7);
    const days = r.ledgers.map((l) => l.csa![0]!);
    expect(days.every((c) => Math.abs(c.share - 1) < 1e-9 && c.makeGood === 0)).toBe(true);
    expect(days.reduce((n, c) => n + c.revenue, 0)).toBeCloseTo(WEEK, 6);
    expect(r.ledgers.reduce((n, l) => n + l.resources[VEG]!.consumed, 0)).toBeGreaterThan(0);
  });

  it('a week with no produce earns nothing and pays half the missing revenue as a make-good', () => {
    const start = farm({ [csa]: 1 }, { [VEG]: 0 });
    const r = stepDays(start, catalog, 7);
    const days = r.ledgers.map((l) => l.csa![0]!);
    expect(days.every((c) => c.share === 0 && c.revenue === 0)).toBe(true);
    const promised = WEEK;
    const paid = r.ledgers.reduce((n, l) => n + (l.spend.makeGood ?? 0), 0);
    expect(paid).toBeCloseTo(promised * rule.makeGoodFactor, 6);
    expect(weeklyBills(r.state, catalog).lines.find((l) => l.item === 'CSA make-good')!.thisWeek.value).toBeCloseTo(paid, 6);
    expect(csaView(r.state, catalog, of(r.state, csa).id)!.makeGood!.value).toBeCloseTo(days.at(-1)!.makeGood, 9);
  });

  it('a make-good never overdraws cash under the cash floor', () => {
    const s = farm({ [csa]: 1 }, { [VEG]: 0 }, { cashFloor: true, startingCash: 0 });
    const r = stepDays(s, catalog, 3);
    expect(r.state.cash).toBeGreaterThanOrEqual(0);
    expect(r.ledgers.every((l) => (l.spend.makeGood ?? 0) === 0)).toBe(true);
  });

  it('runs only in the growing season and only under Selling and trade', () => {
    const winter = stepDays(farm({ [csa]: 1 }, { [VEG]: 200 }, { startDay: 10 }), catalog, 7);
    expect(winter.ledgers.every((l) => !l.csa)).toBe(true);
    expect(winter.ledgers.reduce((n, l) => n + (l.laborBySystem[sysId(csa)] ?? 0), 0)).toBe(0);
    const off = stepDays(farm({ [csa]: 1 }, { [VEG]: 200 }, { sellingAndTrade: false }), catalog, 7);
    expect(off.ledgers.every((l) => !l.csa)).toBe(true);
    expect(off.ledgers.reduce((n, l) => n + (l.laborBySystem[sysId(csa)] ?? 0), 0)).toBe(0);
  });
});

describe('LL-46 spinning and weaving', () => {
  it('turns wool into woolen goods with a loss, adds wellbeing, and the goods sell at their reference price', () => {
    const r = stepDays(farm({ [spinning]: 1 }, { Wool: 10 }), catalog, 7);
    const made = r.ledgers.reduce((n, l) => n + l.resources['Woolen goods']!.produced, 0);
    const used = r.ledgers.reduce((n, l) => n + l.resources.Wool!.consumed, 0);
    expect(used).toBeCloseTo(0.5, 9);
    expect(made).toBeCloseTo(0.45, 9);
    const sale = queueTrade(catalog, r.state, 'Woolen goods', 0.4, 0);
    const sold = stepDay(sale, catalog);
    expect(sold.ledger.trades![0]!.revenue).toBeCloseTo(0.4 * 25 * 0.5, 9);
  });
  it('without wool it makes nothing', () => {
    const r = stepDays(farm({ [spinning]: 1 }, { Wool: 0 }), catalog, 3);
    expect(r.ledgers.every((l) => l.resources['Woolen goods']!.produced === 0)).toBe(true);
  });
});

describe('LL-46 labor barter with Ruth', () => {
  it('trades spare hours for goods at the barter rate, after the tutorial only', () => {
    const s = farm({}, {}, { startingStocks: { ...supplies, Carbon: 0 } });
    expect(() => queueTrade(catalog, s, 'Labor', 4, 0, 'Carbon')).toThrow(/tutorial/);
    expect(() => queueTrade(catalog, finishTutorial(s), 'Labor', 4, 0)).toThrow(/Ruth/);
    const day = stepDay(queueTrade(catalog, finishTutorial(s), 'Labor', 4, 0, 'Carbon'), catalog);
    const carbon = catalog.resources.find((r) => r.name === 'Carbon')!;
    const t = day.ledger.trades![0]!;
    expect(t).toMatchObject({ resource: 'Labor', amount: 4, revenue: 0, received: 'Carbon' });
    expect(t.receivedAmount).toBeCloseTo((4 * rule.laborBarterValuePerHour) / carbon.marketPrice!, 9);
    expect(day.ledger.laborBySystem['Neighbor work']).toBe(4);
    expect(day.state.cash).toBe(s.cash);
  });
  it('fills only from spare hours and keeps the rest of the order waiting', () => {
    const s = finishTutorial(farm({}, {}, { startingStocks: { ...supplies } }));
    const day = stepDay(queueTrade(catalog, s, 'Labor', 100, 0, 'Carbon'), catalog);
    const done = day.ledger.trades![0]!.amount;
    expect(done).toBeGreaterThan(0.5);
    expect(done).toBeLessThan(100);
    expect(day.state.market!.sales![0]!.amount).toBeCloseTo(100 - done, 9);
  });
});

it('CSA, spinning and labor barter replay and continue identically after a JSON save', () => {
  const init = {
    siteId: 'front-range',
    seed: 1,
    settings: { sellingAndTrade: true, wellbeingMult: 0, startDay: SUMMER, startingCash: 1000, startingStocks: { ...supplies, [VEG]: 50, Wool: 5 } },
  };
  const actions = ['Human Being', csa, spinning].map((name, index) => ({
    at: 0, kind: 'place' as const, systemId: sysId(name), mode: 'prebuilt' as const, x: 20 + index * 30, y: 30, id: `i${index + 1}`,
  }));
  let state = startGame(catalog, init);
  for (const a of actions) state = applyAction(catalog, state, a);
  state = stepDays(state, catalog, 10).state;
  expect(gameDigest(replay(catalog, init, actions, 10))).toBe(gameDigest(state));
  const loaded = JSON.parse(JSON.stringify(state)) as GameState;
  expect(gameDigest(stepDays(loaded, catalog, 20).state)).toBe(gameDigest(stepDays(state, catalog, 20).state));
});

