import { describe, expect, it } from 'vitest';
import {
  applyAction,
  buildReport,
  buyAtMarket,
  MILESTONES,
  cashRunway,
  financeView,
  gameDigest,
  manageFinance,
  placeSystem,
  replay,
  serviceSystem,
  startGame,
  stepDays,
  weeklyBills,
  type Action,
  type GameInit,
  type GameState,
} from '../src/index.ts';
import { catalog, newGame, run, sysId } from './time-helpers.ts';

const rule = catalog.finance!;
const home = () => newGame({}, { settings: { finance: true, parcelAcres: 5, startingCash: 10000 } });
const action = (s: GameState, operation: 'borrow' | 'repay' | 'insurance' | 'reserve', amount: number) =>
  manageFinance(catalog, s, operation, amount);
const balanced = (s: GameState) => {
  for (const l of s.ledgers)
    expect(l.cash.start + l.cash.in - l.cash.out - l.cash.purchases + l.cash.refunds).toBeCloseTo(
      l.cash.end,
      8,
    );
};

describe('LL-37 explicit finance', () => {
  it('credit has a hard draw limit, repayment requires cash, and invalid amounts cannot alter the account', () => {
    const s = action(home(), 'borrow', rule.creditLimit);
    expect(s.cash).toBe(15000);
    expect(financeView(s, catalog)!.available.value).toBe(0);
    expect(() => action(s, 'borrow', 1)).toThrow('limit');
    for (const amount of [NaN, Infinity, -1, 0]) expect(() => action(s, 'repay', amount)).toThrow();
    expect(() => action({ ...s, cash: 1 }, 'repay', 2)).toThrow('covered');
    expect(() => action(s, 'repay', rule.creditLimit + 1)).toThrow('covered');
    const repaid = action(s, 'repay', 1000);
    expect(repaid.finance!.debt).toBe(4000);
    expect(repaid.cash).toBe(14000);
    expect(s.finance!.debt).toBe(5000);
    expect(() => action(home(), 'insurance', 2)).toThrow();
    expect(() => action(home(), 'reserve', 1.5)).toThrow();
    expect(() => action(home(), 'reserve', 366)).toThrow();
  });

  it('daily interest and tax have exact annual totals; financing preserves cash conservation and bills', () => {
    let s = action(home(), 'borrow', 1000);
    s = run(s, 7).state;
    s = action(s, 'repay', 400);
    s = run(s, 358).state;
    const interest = ((1000 * 7 + 600 * 358) * rule.annualInterest) / 365;
    expect(s.cash).toBeCloseTo(10000 + 600 - 500 - interest, 7);
    expect(s.finance!.debt).toBe(600);
    expect(s.finance!.taxDue).toBeCloseTo(0);
    balanced(s);
    expect(
      weeklyBills(s, catalog).lines.find((l) => l.item === 'Credit interest')!.thisWeek.value,
    ).toBeCloseTo(((600 * rule.annualInterest) / 365) * 7);
    expect(weeklyBills(s, catalog).lines.find((l) => l.item === 'Property tax')!.thisWeek.value).toBeCloseTo(
      (500 / 365) * 7,
    );
  });

  it('zero cash capitalizes unpaid interest above the draw limit, accumulates tax and cannot silently overdraw', () => {
    let s = action(home(), 'borrow', rule.creditLimit);
    s = { ...s, cash: 0, pendingCash: { purchases: 0, refunds: 0 } };
    const r = run(s, 2);
    expect(r.state.cash).toBe(0);
    expect(r.state.finance!.debt).toBeCloseTo(rule.creditLimit * (1 + rule.annualInterest / 365) ** 2);
    expect(r.state.finance!.taxDue).toBeCloseTo(1000 / 365);
    expect(financeView(r.state, catalog)!.available.value).toBe(0);
    expect(() => placeSystem(catalog, r.state, sysId('Bell Tent'), 50, 50, 'buy')).toThrow('cash');
    balanced(r.state);
    // Cash restored later settles current interest and the whole tax arrear without charging it twice.
    const paid = run({ ...r.state, cash: 100 }, 1).state;
    expect(paid.finance!.taxDue).toBe(0);
    expect(paid.ledgers.at(-1)!.finance!.taxPaid).toBeCloseTo(1500 / 365);
  });

  it('Finance enforces the cash floor on fees, running costs and queued deliveries without automatically borrowing', () => {
    let s = newGame(
      {
        'Human Being': 2,
        'Average Suburban Home': 1,
        'Municipal Water Hookup': 1,
        'Central Power Plant (Coal / NatGas / Nuclear)': 1,
      },
      {
        settings: { startingCash: 1, finance: true, cashFloor: false, startingStocks: { Food: 1e6 } },
      },
    );
    s = buyAtMarket(catalog, s, 'Woody biomass', 10);
    const r = run(s, 7);
    expect(r.state.cash).toBe(0);
    expect(r.state.finance!.debt).toBe(0);
    expect(r.state.finance!.taxDue).toBeGreaterThan(0);
    expect(r.state.market!.orders).toHaveLength(1);
    expect(r.ledgers.every((l) => l.spend.delivery === 0 && l.cash.end >= 0)).toBe(true);
    balanced(r.state);
  });

  it('borrowing, repayment and claims do not masquerade as operating income or spending in the runway', () => {
    let s = run(action(home(), 'borrow', 1000), 7).state;
    const burn = cashRunway(s, catalog).burn;
    expect(burn).toBeCloseTo((500 + 120) / 365);
    s = run(action(s, 'repay', 500), 1).state;
    expect(cashRunway(s, catalog).burn).toBeCloseTo(((500 + 120) * 7 + 500 + 60) / 365 / 8);
    const v = financeView(action(s, 'reserve', 30), catalog)!;
    expect(v.target.value).toBeCloseTo(cashRunway(s, catalog).burn * 30);
    expect(v.target.explain.refs!.days).toBe(30);
    expect(v.shortfall.value).toBe(0);
  });

  it('paid insurance covers newly failed equipment once, excludes old failures, and cannot pay when the premium is unaffordable', () => {
    let s = newGame(
      { 'Bell Tent': 1 },
      { settings: { finance: true, wearAndRepair: true, startingCash: 10000 } },
    );
    const inst = s.instances[0]!;
    s = action({ ...s, instances: [{ ...inst, condition: 1e-10 }] }, 'insurance', 1);
    const r = run(s, 1).state;
    const cost = catalog.systems.find((x) => x.id === inst.systemId)!.costBuy;
    const claim = Math.max(0, cost - rule.deductible) * rule.coverage;
    expect(claim).toBeGreaterThan(0);
    expect(r.ledgers.at(-1)!.finance!.claim).toBeCloseTo(claim);
    expect(r.ledgers.at(-1)!.finance!.premium).toBeCloseTo(rule.insurancePerYear / 365);
    expect(run(r, 1).ledgers[0]!.finance!.claim).toBe(0);
    const broke = run({ ...s, cash: 0 }, 1).state;
    expect(broke.ledgers.at(-1)!.finance!.claim).toBe(0);
    expect(broke.ledgers.at(-1)!.finance!.covered).toBe(false);
    expect(broke.cash).toBe(0);
    balanced(r);
    // An insurance payout must not make the runway look like a profitable day.
    expect(cashRunway(run(r, 6).state, catalog).burn).toBeGreaterThan(0);
  });

  it('repairing a worn asset or opting into insurance after a failure cannot claim a payout', () => {
    let s = newGame(
      { 'Bell Tent': 1 },
      { settings: { finance: true, wearAndRepair: true, startingCash: 10000 } },
    );
    s = { ...s, instances: s.instances.map((i) => ({ ...i, condition: 0 })) };
    s = action(s, 'insurance', 1);
    expect(run(s, 1).ledgers[0]!.finance!.claim).toBe(0);
    s = serviceSystem(catalog, s, s.instances[0]!.id);
    expect(run(s, 7).ledgers.every((l) => l.finance!.claim === 0)).toBe(true);
  });

  it('opt-out pauses charges and preserves debt; legacy games have no finance state or charges', () => {
    const legacy = newGame({});
    expect(run(legacy, 30).state.finance).toBeUndefined();
    expect(() => action(legacy, 'borrow', 1)).toThrow('disabled');
    let s = action(home(), 'borrow', 1000);
    s = run(s, 1).state;
    const paused = run(
      applyAction(catalog, s, { at: 1, kind: 'settings', settings: { finance: false } }),
      7,
    ).state;
    expect(paused.cash).toBe(s.cash);
    expect(paused.finance).toEqual(s.finance);
    expect(financeView(paused, catalog)).toBeNull();
  });

  it('reports label financing and a credit draw cannot earn the net-positive-season milestone', () => {
    const r = run(action(home(), 'borrow', 1000), 91);
    const milestone = MILESTONES.find((m) => m.id === 'cash-season')!;
    expect(milestone.check(r.state, catalog)).toBe(false);
    const report = buildReport(r.state, catalog, 'season', r.ledgers, 'Spring');
    expect(report.financing).toEqual({ borrowed: 1000, repaid: 0, claims: 0 });
    expect(report.cash.net).toBeGreaterThan(0);
    expect(financeView(r.state, catalog)!.capitalized.value).toBe(0);
  });

  it('opting in labels a legacy overdraft as debt and pending financing stays visible if the gate is turned off before stepping', () => {
    const legacy = { ...newGame({}), cash: -62 };
    const enabled = applyAction(catalog, legacy, { at: 0, kind: 'settings', settings: { finance: true } });
    expect(enabled.cash).toBe(0);
    expect(enabled.finance!.debt).toBe(62);
    const funded = action(enabled, 'borrow', 1000);
    const paused = applyAction(catalog, funded, { at: 0, kind: 'settings', settings: { finance: false } });
    const r = run(paused, 7).state;
    balanced(r);
    expect(cashRunway(r, catalog).burn).toBe(0);
    expect(r.finance!.debt).toBe(1062);
  });

  it('logged opt-in, borrowing, reserve and insurance actions replay and JSON continuation exactly, including pending draws', () => {
    const init: GameInit = { siteId: 'front-range', seed: 37, settings: { startingCash: 10000 } };
    const actions: Action[] = [
      { at: 3, kind: 'settings', settings: { finance: true } },
      { at: 3, kind: 'finance', operation: 'borrow', amount: 2000 },
      { at: 3, kind: 'finance', operation: 'insurance', amount: 1 },
      { at: 4, kind: 'finance', operation: 'reserve', amount: 60 },
      { at: 6, kind: 'finance', operation: 'repay', amount: 500 },
    ];
    let live = startGame(catalog, init);
    for (const a of actions) {
      live = stepDays(live, catalog, a.at - live.calendar.absDay).state;
      live = applyAction(catalog, live, a);
    }
    expect(gameDigest(live)).toBe(gameDigest(replay(catalog, init, actions, 6)));
    const clone = JSON.parse(JSON.stringify(live)) as GameState;
    expect(gameDigest(run(clone, 30).state)).toBe(gameDigest(replay(catalog, init, actions, 36)));
    expect(gameDigest(live)).not.toBe(gameDigest({ ...live, finance: { ...live.finance!, debt: 0 } }));
    balanced(run(clone, 30).state);
  });
});
