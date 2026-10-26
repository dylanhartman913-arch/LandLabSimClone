import { describe, expect, it } from 'vitest';
import { getQuestLine } from '@homestead/catalog';
import {
  applyAction, buildReport, gameDigest, newTutorial, queueTrade, replay, ruthTrades,
  placeSystem, startGame, stepDay, stepDays, systemCard, type GameState,
} from '../src/index.ts';
import { weeklyFactor } from '../src/periods.ts';
import { catalog, newGame, run, sysId } from './time-helpers.ts';

const of = (s: GameState, name: string) => s.instances.filter((i) => i.systemId === sysId(name));

describe('LL-55 existing barter is reachable without an active tutorial', () => {
  for (const id of ['farm', 'cabin', 'greenfield']) it(`${id}: goods and spare labor fulfill and replay after saving`, () => {
    const init = { siteId: 'front-range', seed: 1, start: { id, difficulty: 'standard' as const, household: 2 }, settings: { sellingAndTrade: true } };
    const actions = [
      ...(id === 'greenfield' ? [{ at: 0, kind: 'tutorial' as const, skip: true }] : []),
      { at: 0, kind: 'sell' as const, resource: 'Labor', amount: 1, keep: 0, receive: 'Carbon' },
    ];
    let s = startGame(catalog, init);
    for (const a of actions) s = applyAction(catalog, s, a);
    expect(ruthTrades(s)).toBe(true);
    const loaded = JSON.parse(JSON.stringify(s)) as GameState;
    const next = stepDays(s, catalog, 7).state;
    expect(next.ledgers.flatMap((l) => l.trades ?? []).some((t) => t.resource === 'Labor' && t.receivedAmount! > 0)).toBe(true);
    expect(gameDigest(stepDays(loaded, catalog, 7).state)).toBe(gameDigest(next));
    expect(gameDigest(replay(catalog, init, actions, 7))).toBe(gameDigest(next));
    const goods = { ...s, stocks: { ...s.stocks, Honey: 1000 } };
    const traded = stepDays(queueTrade(catalog, goods, 'Honey', 1, 990, 'Carbon'), catalog, 7);
    expect(traded.ledgers.flatMap((l) => l.trades ?? []).some((t) => t.resource === 'Honey' && t.receivedAmount! > 0)).toBe(true);
  });
  it('active tutorials stay gated until completion, and disabled trade is rejected', () => {
    const base = newGame({ 'Human Being': 1 }, { settings: { sellingAndTrade: true } });
    for (const current of [0, 1, getQuestLine('greenfield').quests.length - 1]) {
      const s = { ...base, tutorial: { ...newTutorial('greenfield', 0), current } };
      expect(ruthTrades(s)).toBe(false);
      expect(() => queueTrade(catalog, s, 'Labor', 1, 0, 'Carbon')).toThrow(/tutorial/);
    }
    const done = { ...base, tutorial: { ...newTutorial('greenfield', 0), current: getQuestLine('greenfield').quests.length } };
    expect(ruthTrades(done)).toBe(true);
    expect(queueTrade(catalog, done, 'Labor', 1, 0, 'Carbon').market!.sales).toHaveLength(1);
    expect(() => queueTrade(catalog, { ...base, settings: { ...base.settings, sellingAndTrade: false } }, 'Labor', 1, 0, 'Carbon')).toThrow(/disabled/);
  });
});

describe('LL-56 placed cards distinguish measured operation from catalog estimates', () => {
  for (const day of [0, 172, 340]) for (const name of ['Rocket Mass Heater', 'Raised Beds (24 sq ft)', '500W Photovoltaic Panels']) {
    it(`${name}, day ${day}: two instances agree with actual ledger output`, () => {
      const s = newGame({ 'Human Being': 1, 'Bell Tent': 1, [name]: 2 }, { settings: { startDay: day, unlimitedSupply: true, weatherMode: 'average', wellbeingMult: 0 } });
      const r = stepDay(s, catalog);
      const instances = of(r.state, name);
      const cards = instances.map((i) => systemCard(r.state, catalog, i.systemId, i.id));
      const preview = systemCard(r.state, catalog, sysId(name));
      for (const o of cards[0]!.outputs.filter((o) => o.view.flow.period !== 'Capacity')) {
        const factor = weeklyFactor(catalog, o.view.flow.period, s.site.assumptions);
        const totalDaily = cards.reduce((n, c) => n + c.outputs.find((x) => x.view.resource === o.view.resource)!.produced.value * factor / 7, 0);
        const ledger = r.ledger.resources[o.view.resource];
        if (ledger) expect(totalDaily).toBeCloseTo(ledger.produced, 8);
        expect(o.window).toContain('equivalent of yesterday');
        expect(o.nominal!.value).toBe(preview.outputs.find((x) => x.view.resource === o.view.resource)!.produced.value);
        if (name.startsWith('Raised') && day === 0 && ledger) expect(o.produced.value).toBe(0);
      }
      expect(preview.outputs.every((o) => !o.nominal)).toBe(true);
      expect(cards[0]!.basis).toContain('not a forecast');
    });
  }
  it('curtailed input use is the received amount, not the larger offered amount', () => {
    const r = run(newGame({ Well: 1, '500W Photovoltaic Panels': 1 }, { settings: { startDay: 172 } }), 3);
    const inst = of(r.state, 'Well')[0]!;
    const c = systemCard(r.state, catalog, inst.systemId, inst.id);
    const elec = c.inputs.find((i) => i.view.resource === 'Electricity')!;
    expect(elec.measured!.used.value).toBeCloseTo(r.ledgers.at(-1)!.resources.Electricity!.consumed);
    expect(elec.measured!.used.value).toBeLessThan(elec.measured!.requested.value);
    expect(c.outputs.find((o) => o.view.resource === 'Water')!.produced.value / 7).toBeCloseTo(r.ledgers.at(-1)!.resources.Water!.produced);
  });
  for (const name of ['Raised Beds (24 sq ft)', '500W Photovoltaic Panels']) it(`${name}: changing wear/fertility does not lose yesterday's instance measurement`, () => {
    let s = newGame({ [name]: 1 }, { settings: { startDay: 172, weatherMode: 'average', unlimitedSupply: true, wearAndRepair: true, soilFertility: true } });
    s = { ...s, instances: s.instances.map((i) => ({ ...i, condition: 0.6, fertility: 0.5 })) };
    const r = stepDay(s, catalog);
    const inst = of(r.state, name)[0]!;
    const c = systemCard(r.state, catalog, inst.systemId, inst.id);
    expect(c.hasMeasurement).toBe(true);
    const output = c.outputs.find((o) => o.view.flow.period !== 'Capacity')!;
    expect(output.produced.value * weeklyFactor(catalog, output.view.flow.period, s.site.assumptions) / 7)
      .toBeCloseTo(r.ledger.resources[output.view.resource]!.produced, 9);
    expect(output.produced.value).toBeGreaterThan(0);
  });
  it('a newly placed copy cannot borrow the existing copy’s measurement', () => {
    const s = stepDay(newGame({ '500W Photovoltaic Panels': 1 }, { settings: { startDay: 172 } }), catalog).state;
    const added = placeSystem(catalog, s, sysId('500W Photovoltaic Panels'), 150, 150, 'prebuilt');
    const c = systemCard(added.state, catalog, sysId('500W Photovoltaic Panels'), added.instanceId);
    expect(c.hasMeasurement).toBe(false);
    expect(c.outputs[0]!.produced.value).toBe(0);
    expect(c.outputs[0]!.window).toBe('not measured yet');
    expect(systemCard(added.state, catalog, sysId('500W Photovoltaic Panels'), s.instances[0]!.id).hasMeasurement).toBe(true);
  });
  it('a scaled child’s labor matches the allocator before end-of-day health changes', () => {
    let s = newGame({ 'Human Being': 1 }, { settings: { householdRoles: true } });
    s = { ...s, instances: s.instances.map((i) => ({ ...i, scale: 0.8, person: { ...i.person!, role: 'child', health: 0.6 } })) };
    const r = stepDay(s, catalog);
    const i = r.state.instances[0]!;
    const output = systemCard(r.state, catalog, i.systemId, i.id).outputs.find((o) => o.view.resource === 'Labor')!;
    expect(output.produced.value / 7).toBeCloseTo(r.ledger.labor.pool, 10);
  });
  it('a grocery card shows its measured on-demand bill instead of nominal cash use', () => {
    const s = startGame(catalog, { siteId: 'front-range', seed: 1, start: { id: 'farm', difficulty: 'standard', household: 2 }, settings: {} });
    const r = stepDay(stepDays(s, catalog, 20).state, catalog);
    const i = of(r.state, 'Big Box Grocery Store')[0]!;
    const c = systemCard(r.state, catalog, i.systemId, i.id);
    const cash = c.inputs.find((x) => x.view.resource === 'Capital')!.measured!.used.value;
    const spent = r.ledger.spend.backstop.Food!;
    expect(cash).toBeGreaterThan(0);
    expect(cash).toBeCloseTo(spent, 9);
  });
  it('an unmeasured new system makes no claim of operating output, while capacity remains a level', () => {
    const s = newGame({ 'Bell Tent': 1, '500W Photovoltaic Panels': 1 });
    const panel = of(s, '500W Photovoltaic Panels')[0]!;
    const card = systemCard(s, catalog, panel.systemId, panel.id);
    expect(card.hasMeasurement).toBe(false);
    expect(card.outputs[0]!.produced.value).toBe(0);
    expect(card.basis).toContain('awaiting the first');
    const tent = of(s, 'Bell Tent')[0]!;
    const shelter = systemCard(s, catalog, tent.systemId, tent.id).outputs.find((o) => o.view.resource === 'Shelter')!;
    expect(shelter.window).toBe('capacity');
    expect(shelter.produced.value).toBeGreaterThan(0);
    expect(shelter.nominal).toBeUndefined();
  });
});

describe('LL-57 reports include measured shelter shortfalls', () => {
  it('the greenfield report ranks shelter before comfort and agrees with its monthly table', () => {
    const s = stepDays(startGame(catalog, { siteId: 'front-range', seed: 1, settings: {}, start: { id: 'greenfield', difficulty: 'standard', household: 2 } }), catalog, 30).state;
    const r = buildReport(s, catalog, 'season', s.ledgers, 'Spring');
    const shelter = r.shortages.find((x) => x.resource === 'Shelter')!;
    expect(shelter).toBeDefined();
    expect(shelter.unmetShare).toBeCloseTo(1 - r.monthly[0]!.rows.Shelter!);
    expect(shelter.chain).toContain('capacity');
    expect(shelter.chain).not.toContain('nothing in the design');
    const comfort = r.shortages.findIndex((x) => ['Cooling', 'Transportation', 'Hot water'].includes(x.resource));
    if (comfort >= 0) expect(r.shortages.indexOf(shelter)).toBeLessThan(comfort);
  });
  it('a full-capacity farm has no shelter shortage', () => {
    const s = stepDays(startGame(catalog, { siteId: 'front-range', seed: 1, settings: {}, start: { id: 'farm', difficulty: 'standard', household: 2 } }), catalog, 30).state;
    expect(buildReport(s, catalog, 'season', s.ledgers, 'Spring').shortages.some((x) => x.resource === 'Shelter')).toBe(false);
  });
  for (const unassigned of [false, true]) it(`occupancy explains ${unassigned ? 'an unassigned home' : 'overcrowding'} without denying existing shelter`, () => {
    let s = newGame({ 'Human Being': 2, 'Bell Tent': 1 }, { settings: { shelterOccupancy: true, householdCorrectness: true, wellbeingMult: 0 } });
    if (unassigned) s = { ...s, instances: s.instances.map((i) => i.person ? { ...i, shelterId: null } : i) };
    s = stepDays(s, catalog, 7).state;
    const r = buildReport(s, catalog, 'season', s.ledgers, 'Week');
    const short = r.shortages.find((x) => x.resource === 'Shelter')!;
    expect(short).toBeDefined();
    expect(short.chain).toContain(unassigned ? 'no assigned open home' : 'overcrowded');
    expect(short.chain).not.toContain('no completed open shelter');
  });
});
