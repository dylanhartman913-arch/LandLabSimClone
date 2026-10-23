import { describe, expect, it } from 'vitest';
import { getSite, getStart } from '@homestead/catalog';
import { advanceTo, catalog, newGame, place, run, sysId } from './time-helpers.ts';
import {
  applyAction,
  constructionView,
  contractorQuote,
  gameDigest,
  goalStatus,
  hireConstruction,
  questView,
  refundFor,
  replay,
  returnChecks,
  setStandingOrder,
  stepDay,
  survivalAlerts,
  townRecoveryView,
  winterPreparation,
  buildReport,
  gameFromStart,
  recoveryRoute,
  transitionForecast,
  ALERT_GROUPS,
  type GameState,
  type Action,
  type GameInit,
} from '../src/index.ts';
import winter from './fixtures/playtest/winter.json';
import spring from './fixtures/playtest/spring.json';

const winterGame = () =>
  applyAction(catalog, replay(catalog, winter.init as GameInit, winter.actions as Action[], winter.absDay), {
    at: winter.absDay,
    kind: 'settings',
    settings: { safeRecovery: true },
  });

describe('paid construction and emergency labor', () => {
  it('the actual zero-labor winter save can buy finite construction, with no output until completion', () => {
    const s = winterGame();
    const before = gameDigest(s);
    const q = contractorQuote(
      s,
      s.instances.find((i) => i.id === 'i21')!,
    );
    expect(q).toMatchObject({ cost: 2100, days: 8, blocked: null });
    const hired = hireConstruction(s, 'i21');
    expect(hired.cash).toBe(s.cash - q.cost);
    expect(hired.pendingCash.purchases).toBe(s.pendingCash.purchases + q.cost);
    const seven = run(hired, 7);
    expect(seven.ledgers.every((l) => l.labor.pool === 0 && l.labor.construction === 0)).toBe(true);
    expect(seven.state.instances.find((i) => i.id === 'i21')!.status).toBe('building');
    expect(seven.state.instances.find((i) => i.id === 'i21')!.setupHoursDone).toBe(56);
    expect(run(seven.state, 1).state.instances.find((i) => i.id === 'i21')!.status).toBe('active');
    expect(gameDigest(s)).toBe(before);
  });

  it('quotes explain missing cash, reject duplicate crews, and refund only unworked crew hours', () => {
    const s = winterGame();
    const inst = s.instances.find((i) => i.id === 'i21')!;
    expect(contractorQuote({ ...s, cash: 100 }, inst).blocked).toContain('missing $2000.00');
    expect(() => hireConstruction({ ...s, cash: 100 }, inst.id)).toThrow('missing $2000.00');
    const hired = hireConstruction(s, inst.id);
    expect(() => hireConstruction(hired, inst.id)).toThrow('already booked');
    const partial = run(hired, 2).state.instances.find((i) => i.id === inst.id)!;
    expect(refundFor(partial)).toBe(inst.paid + 44 * 35);
    expect(refundFor(run(hired, 8).state.instances.find((i) => i.id === inst.id)!)).toBe(inst.paid * 0.25);
  });

  it('emergency building displaces employment and fetching, overriding the build cap, then can be disabled', () => {
    const ready = newGame(
      { 'Human Being': 2, 'Remote Job (40 hrs)': 1 },
      {
        settings: {
          startDay: 120,
          work: { caps: { construction: 0 }, priorities: { construction: 5 } },
          autoGather: { waterDays: 7 },
        },
      },
    );
    const s = place(ready, 'Rocket Mass Heater', 80, 80, 'diy').state;
    const normal = stepDay(s, catalog);
    expect(normal.ledger.labor.construction).toBe(0);
    expect(normal.ledger.labor.upkeepDelivered).toBeGreaterThan(0);
    const emergency = stepDay({ ...s, settings: { ...s.settings, emergencyConstruction: true } }, catalog);
    expect(emergency.ledger.labor.construction).toBe(emergency.ledger.labor.pool);
    expect(emergency.ledger.labor.upkeepDelivered).toBe(0);
    expect(emergency.ledger.gathered ?? []).toHaveLength(0);
    const off = stepDay(
      { ...emergency.state, settings: { ...emergency.state.settings, emergencyConstruction: false } },
      catalog,
    );
    expect(off.ledger.labor.construction).toBe(0);
    expect(off.ledger.labor.upkeepDelivered).toBeGreaterThan(0);
  });

  it('finish forecast includes competing labor and paid crews without changing live state', () => {
    let s = winterGame();
    const before = gameDigest(s);
    expect(constructionView(s, catalog).find((q) => q.id === 'i21')!.eta).toBeGreaterThan(100);
    expect(gameDigest(s)).toBe(before);
    s = hireConstruction(s, 'i21');
    expect(constructionView(s, catalog).find((q) => q.id === 'i21')!.eta).toBe(8);
  });

  it('new hire actions survive deterministic action-log replay', () => {
    const actions: Action[] = [
      ...(winter.actions as Action[]),
      { at: 240, kind: 'settings', settings: { safeRecovery: true } },
      { at: 240, kind: 'hireConstruction', id: 'i21' },
    ];
    const replayed = replay(catalog, winter.init as GameInit, actions, 248);
    expect(gameDigest(replayed)).toBe(gameDigest(run(hireConstruction(winterGame(), 'i21'), 8).state));
  });
});

describe('return checks and survival guidance', () => {
  it('the unchanged cold winter save cannot bring people back even with food, water and shelters', () => {
    const s = winterGame();
    const before = gameDigest(s);
    expect(returnChecks(s, catalog).join(' ')).toContain('Heat fails');
    expect(run(s, 21).events.filter((e) => e.kind === 'came-home')).toHaveLength(0);
    expect(gameDigest(s)).toBe(before);
    const hints = survivalAlerts(s, catalog);
    expect(hints[0]!.id).toBe('town-recovery');
    expect(hints[0]!.detail).toContain('Heat');
    expect(hints[0]!.detail).toContain('i3');
    expect(hints[0]!.detail).toContain('i4');
  });

  it('winter recovery works with outside employment retained, funded crews and recurring fuel', () => {
    let s = winterGame();
    s = {
      ...s,
      settings: {
        ...s.settings,
        work: { priorities: { upkeep: 1, 'gather-water': 2, 'gather-wood': 2, 'gather-food': 2 } },
      },
    };
    s = hireConstruction(hireConstruction(s, 'i20'), 'i21');
    s = setStandingOrder(catalog, s, 'Woody biomass', 500, 1500);
    s = setStandingOrder(catalog, s, 'Carbon', 40, 120);
    s = setStandingOrder(catalog, s, 'Food', 28000, 84000);
    const r = run(s, 30);
    expect(r.events.filter((e) => e.kind === 'came-home')).toHaveLength(2);
    expect(r.events.filter((e) => e.kind === 'went-to-town')).toHaveLength(0);
    expect(
      r.state.instances.filter((i) => i.person).every((i) => !i.person!.away && i.person!.wellbeing > 50),
    ).toBe(true);
    expect(r.state.instances.some((i) => i.systemId === sysId('Remote Job (40 hrs)'))).toBe(true);
    expect(r.ledgers.slice(-7).some((l) => (l.laborBySystem[sysId('Remote Job (40 hrs)')] ?? 0) > 0)).toBe(
      true,
    );
    expect(townRecoveryView(r.state, catalog).people).toHaveLength(0);
  });

  it('whole-household reserve checks reject one-person supplies for two returning adults', () => {
    const s = winterGame();
    const missing = returnChecks(
      { ...s, stocks: { ...s.stocks, Food: 20000, 'Drinking water': 3 } },
      catalog,
    ).join(' ');
    expect(missing).toContain('whole household');
    expect(missing).toContain('kcal');
    expect(missing).toContain('safe drinking water');
  });

  it('food and safe water warnings appear after one bad day and consumables before depletion', () => {
    let s = newGame({ 'Human Being': 2 }, { settings: { startingStocks: {} } });
    s = run(s, 1).state;
    const alerts = survivalAlerts(s, catalog);
    expect(alerts[0]!.id).toBe('drinkingWater');
    expect(alerts.some((a) => a.id === 'food')).toBe(true);
    expect(alerts[0]!.detail).toContain('1 day until wellbeing penalties');
    const carbon = survivalAlerts(
      newGame({ 'Humanure Bucket System': 1 }, { settings: { startingStocks: { Carbon: 1 } } }),
      catalog,
    ).find((a) => a.id === 'Carbon');
    expect(carbon!.detail).toContain('days on hand');
    expect(carbon!.detail).toContain('standing order');
    expect(
      survivalAlerts(newGame({ 'Chicken Coop (12 hens)': 1 }), catalog).some((a) => a.id === 'Chicken feed'),
    ).toBe(true);
  });

  it('a wood stove with two days of firewood warns about fuel before it runs out', () => {
    const fuel = survivalAlerts(
      newGame({ 'Tiny Wood Stove': 1 }, { settings: { startDay: 10, startingStocks: { 'Woody biomass': 15 } } }),
      catalog,
    ).find((a) => a.id === 'Woody biomass');
    expect(fuel!.title).toBe('Woody biomass reserve is low');
    expect(fuel!.detail).toContain('2.1 days on hand');
    expect(fuel!.detail).toContain('Tiny Wood Stove');
    expect(
      survivalAlerts(
        newGame({ 'Tiny Wood Stove': 1 }, { settings: { startDay: 10, startingStocks: { 'Woody biomass': 500 } } }),
        catalog,
      ).some((a) => a.id === 'Woody biomass'),
    ).toBe(false);
  });

  it('raised beds with no seed warn in the week before the growing season, not only once planting fails', () => {
    let warned: string | undefined;
    for (let day = 0; day < 365 && !warned; day++) {
      const s = newGame({ 'Raised Beds (24 sq ft)': 1 }, { settings: { startDay: day, startingStocks: {} } });
      if (s.weather.growing) continue;
      warned = survivalAlerts(s, catalog).find((a) => a.id === 'Seeds')?.detail;
    }
    expect(warned).toMatch(/once demand starts in [1-6] days?/);
  });

  it('hot weather cooling is surfaced immediately after survival needs', () => {
    const s = run(
      newGame({ 'Human Being': 1, 'Canvas Wall Tent + Stove Jack': 1 }, { settings: { startDay: 200 } }),
      1,
    ).state;
    const l = s.ledgers[0]!;
    const hot = {
      ...s,
      ledgers: [
        {
          ...l,
          weather: { ...l.weather, cdd: 10 },
          needs: {
            ...l.needs,
            'Cooled shelter': { ...l.needs['Cooled shelter'], needed: 100, delivered: 0 },
          },
        },
      ],
    };
    const alerts = survivalAlerts(hot, catalog);
    expect(alerts.find((a) => a.id === 'cooling')!.detail).toContain('each hot day');
    expect(alerts.findIndex((a) => a.id === 'cooling')).toBeGreaterThan(
      alerts.findIndex((a) => a.id === 'sanitation'),
    );
  });

  it('water tutorial reports a configuration target and explicitly identifies assistance', () => {
    const s = replay(catalog, spring.init as GameInit, spring.actions as Action[], spring.absDay);
    expect(
      goalStatus(
        { ...s, stocks: {}, settings: { ...s.settings, autoGather: { waterDays: 7 } } },
        catalog,
        { kind: 'setting', rule: 'waterDays', atLeast: 7 },
        0,
      ),
    ).toMatchObject({ done: true, detail: expect.stringContaining('does not prove a reserve exists') });
    expect(questView(s, catalog)!.rewardText).toContain('$');
    expect(winterPreparation(s)).toContain('days away');
  });

  it('reports exclude empty-home days instead of calling full labor share health', () => {
    const s = run(newGame({ 'Human Being': 1 }), 2).state;
    const ledgers = [s.ledgers[0]!, { ...s.ledgers[1]!, wellbeing: null, health: 1 }];
    const r = buildReport(s, catalog, 'season', ledgers, 'Test');
    expect(r.wellbeingDays).toBe(1);
    expect(r.averageWellbeing).toBe(s.ledgers[0]!.wellbeing);
    expect(r.averageResidentLabor).toBe(s.ledgers[0]!.health);
    expect(buildReport(s, catalog, 'season', [ledgers[1]!], 'Empty').averageWellbeing).toBeNull();
  });
});

describe('a finite recovery route with zero resident labor', () => {
  const book = (s: ReturnType<typeof winterGame>, actions: NonNullable<ReturnType<typeof recoveryRoute>>['actions']) =>
    actions.reduce((g, body) => applyAction(catalog, g, { ...body, at: g.calendar.absDay } as Action), s);

  it('the zero-labor winter save gets one priced, simulated route home that leaves live state untouched', () => {
    const s = winterGame();
    const before = gameDigest(s);
    const route = recoveryRoute(s, catalog)!;
    expect(gameDigest(s)).toBe(before);
    expect(route.steps.filter((st) => st.action.kind === 'hireConstruction').map((st) => st.cost)).toEqual([
      expect.closeTo(247.05, 2),
      2100,
    ]);
    expect(route.upfront).toBeCloseTo(2347.05, 2);
    expect(route.steps.some((st) => st.label === 'Look after systems before gathering')).toBe(true);
    expect(route.steps.some((st) => st.label.startsWith('Standing order: keep Woody biomass above'))).toBe(true);
    expect(route.unfunded).toEqual([]);
    expect(route.returnDay).not.toBeNull();
    expect(route.returnDay!).toBeLessThanOrEqual(route.horizon);
    expect(route.staysHome).toBe(true);
    expect(route.leftAgain).toBeNull();
    expect(route.cashAtReturn!).toBeGreaterThan(0);
  });

  it('booking the route keeps the household home for 90 days with the remote job retained', () => {
    const s = winterGame();
    const r = run(book(s, recoveryRoute(s, catalog)!.actions), 90);
    expect(r.events.filter((e) => e.kind === 'came-home')).toHaveLength(2);
    expect(r.events.filter((e) => e.kind === 'went-to-town')).toHaveLength(0);
    expect(r.state.instances.filter((i) => i.person).every((i) => !i.person!.away && i.person!.wellbeing > 50)).toBe(true);
    expect(r.state.instances.some((i) => i.systemId === sysId('Remote Job (40 hrs)'))).toBe(true);
  });

  it('short of cash, the cheap crew is funded first and the missing amount for the other is exact', () => {
    const route = recoveryRoute({ ...winterGame(), cash: 1000 }, catalog)!;
    expect(route.steps.filter((st) => st.action.kind === 'hireConstruction')).toHaveLength(1);
    expect(route.unfunded).toHaveLength(1);
    expect(route.unfunded[0]).toContain('i21');
    expect(route.unfunded[0]).toContain('missing $1347.05');
    expect(route.upfront).toBeLessThanOrEqual(1000);
  });

  it('with no project to finish, the route says exactly which return check still fails', () => {
    const s = winterGame();
    const route = recoveryRoute({ ...s, instances: s.instances.filter((i) => i.status !== 'building') }, catalog)!;
    expect(route.returnDay).toBeNull();
    expect(route.remaining.join(' ')).toContain('Heat fails the three-day return trial');
  });

  it('a household at home has no recovery route', () => {
    expect(recoveryRoute(newGame({ 'Human Being': 1 }), catalog)).toBeNull();
  });
});

describe('LL-13: the household the game starts with can always come home', () => {
  const NEW = { safeRecovery: true, reuseIdleLabor: true, survivalShelterReturn: true };
  /** A greenfield household sent to town 20 days ago, as in the Oct 22 playtest, in late summer. */
  const inTown = (settings: Partial<GameState['settings']>, drop: (name: string) => boolean = () => false) => {
    let s = gameFromStart(catalog, getSite('front-range'), getStart('greenfield'), {});
    s = { ...s, settings: { ...s.settings, ...settings, startDay: 0 } };
    s = advanceTo(s, 230);
    return {
      ...s,
      instances: s.instances
        .filter((i) => !drop(catalog.systems.find((x) => x.id === i.systemId)!.name))
        .map((i) => (i.person ? { ...i, person: { ...i.person, wellbeing: 0, away: { since: s.calendar.absDay - 20 } } } : i)),
    };
  };

  it('the starter tent (about half of two adults’ need) meets the survival shelter level for return', () => {
    expect(returnChecks(inTown(NEW), catalog).join(' ')).not.toContain('shelter');
  });

  it('legacy safer-return games keep the full-shelter rule they were recorded with', () => {
    expect(returnChecks(inTown({ safeRecovery: true }), catalog)).toContain('Complete enough shelter for the whole household.');
  });

  it('with no shelter left, the route proposes the cheapest shelter, places and crews it, and the simulation brings everyone home', () => {
    const s = inTown(NEW, (n) => n === 'Canvas Wall Tent + Stove Jack');
    expect(returnChecks(s, catalog).join(' ')).toContain('Complete shelter for at least 50%');
    const route = recoveryRoute(s, catalog)!;
    const placed = route.actions[0]!;
    expect(placed.kind).toBe('place');
    expect(route.steps[0]!.label).toMatch(/^Build /);
    expect(route.actions.some((a) => a.kind === 'hireConstruction' && a.id === (placed as { id: string }).id)).toBe(true);
    expect(route.returnDay).not.toBeNull();
    expect(route.staysHome).toBe(true);
    expect(route.unbuildable).toBeNull();
    const booked = route.actions.reduce((g, b) => applyAction(catalog, g, { ...b, at: g.calendar.absDay } as Action), s);
    const r = run(booked, route.returnDay! + 5);
    expect(r.state.instances.filter((i) => i.person).every((i) => !i.person!.away)).toBe(true);
  });

  it('a route that cannot be afforded says what it could not fix', () => {
    const route = recoveryRoute({ ...inTown(NEW, (n) => n === 'Canvas Wall Tent + Stove Jack'), cash: 5 }, catalog)!;
    expect(route.returnDay).toBeNull();
    expect(route.unbuildable).toContain('Shelter');
  });

  it('the recovery alert points at the failing need and lists only survival causes', () => {
    const s = inTown(NEW, (n) => n === 'Canvas Wall Tent + Stove Jack');
    const view = townRecoveryView(s, catalog);
    expect(view.resource).toBe('Shelter');
    const alert = survivalAlerts(s, catalog).find((a) => a.id === 'town-recovery')!;
    expect(alert.resource).toBe('Shelter');
    for (const c of view.causes) expect(['Drinking water', 'Food', 'Shelter', 'Heat', 'Sanitation']).toContain(c);
  });
});

describe('LL-15: food, safe water and cash warn before they run out', () => {
  const camp = (stocks: Record<string, number>, extra: Record<string, number> = {}, settings: Partial<GameState['settings']> = {}) =>
    run(
      newGame({ 'Human Being': 2, 'Canvas Wall Tent + Stove Jack': 1, ...extra }, { settings: { startDay: 150, startingStocks: stocks, ...settings } }),
      1,
    ).state;

  it('a pantry a few days from empty warns while meals are still fully met', () => {
    const s = camp({ Food: 20_000, 'Drinking water': 60 });
    expect(s.ledgers.at(-1)!.needs.Food.delivered).toBeCloseTo(s.ledgers.at(-1)!.needs.Food.needed, 6);
    const food = survivalAlerts(s, catalog).find((a) => a.id === 'food-runway')!;
    expect(food.title).toMatch(/^Food runs out in about [1-6] days?$/);
    expect(food.days).toBeLessThanOrEqual(7);
    expect(food.detail).toContain('standing order');
  });

  it('edible harvest in stock counts toward the pantry', () => {
    const s = camp({ Food: 20_000, 'Root crops': 200, 'Drinking water': 60 });
    const food = survivalAlerts(s, catalog).find((a) => a.id === 'food-runway');
    expect(food?.days ?? Infinity).toBeGreaterThan(survivalAlerts(camp({ Food: 20_000, 'Drinking water': 60 }), catalog).find((a) => a.id === 'food-runway')!.days!);
  });

  it('a standing grocery order the household can pay for silences the food warning', () => {
    let s = camp({ Food: 20_000, 'Drinking water': 60 });
    s = setStandingOrder(catalog, s, 'Food', 28_000, 84_000);
    expect(survivalAlerts(s, catalog).some((a) => a.id === 'food-runway')).toBe(false);
  });

  it('bottled water with nothing treating more warns; a working filter does not', () => {
    expect(survivalAlerts(camp({ Food: 200_000, 'Drinking water': 6 }), catalog).find((a) => a.id === 'water-runway')!.title).toMatch(
      /^Safe drinking water runs out in about \d days$/,
    );
    const filtered = camp({ Food: 200_000, 'Drinking water': 6, Water: 50 }, { 'Drinking Water Filter': 1 });
    expect(survivalAlerts(filtered, catalog).some((a) => a.id === 'water-runway')).toBe(false);
  });

  it('spending with no income warns a month ahead of reaching zero cash', () => {
    let s = run(
      newGame({ 'Human Being': 2, 'Canvas Wall Tent + Stove Jack': 1 }, { settings: { startDay: 150, startingCash: 900, startingStocks: { 'Drinking water': 60 } } }),
      0,
    ).state;
    s = setStandingOrder(catalog, s, 'Food', 14_000, 42_000);
    s = run(s, 14).state;
    const cash = survivalAlerts(s, catalog).find((a) => a.id === 'cash-runway')!;
    expect(cash.title).toMatch(/^Cash reaches \$0 in about \d+ days$/);
    expect(cash.days).toBeLessThanOrEqual(30);
    expect(cash.detail).toContain('Food');
  });

  it('runway warnings rank ahead of cooling comfort', () => {
    const s = camp({ Food: 20_000, 'Drinking water': 60 });
    const l = s.ledgers.at(-1)!;
    const hot = { ...s, ledgers: [{ ...l, weather: { ...l.weather, cdd: 10 }, needs: { ...l.needs, 'Cooled shelter': { ...l.needs['Cooled shelter'], needed: 100, delivered: 0 } } }] };
    const ids = survivalAlerts(hot, catalog).map((a) => a.id);
    expect(ids.indexOf('food-runway')).toBeLessThan(ids.indexOf('cooling'));
  });

  it('the 90-day forecast headline names the first harmful shortage and the departure', () => {
    // A toilet with sawdust, past the day-1 service warm-up (LL-17), so food is the first real harm.
    const s = run(camp({ Food: 60_000, 'Drinking water': 300, Carbon: 300 }, { 'Humanure Bucket System': 2 }, { peopleLeave: true }), 2).state;
    const fc = transitionForecast(s, catalog);
    expect(fc.firstHarm?.need).toBe('Food');
    expect(fc.departureDay).not.toBeNull();
    const alert = survivalAlerts(s, catalog, fc).find((a) => a.id === 'forecast')!;
    expect(alert.title).toMatch(/^Forecast: residents leave for town in about \d+ days$/);
    expect(alert.detail).toContain('Food');
    expect(survivalAlerts(s, catalog).some((a) => a.id === 'forecast')).toBe(false);
  });
});

describe('LL-14: one ranked list of every alert', () => {
  // The default new-game camp, two days in, with a pantry and safe water a few days from empty and no heat.
  const crisis = () => {
    const s = run(
      newGame({ 'Human Being': 2, 'Bell Tent': 1, 'Humanure Bucket System': 1 }, { settings: { startDay: 90, peopleLeave: true, startingStocks: { Food: 240_000, 'Drinking water': 40, Carbon: 3 } } }),
      2,
    ).state;
    return { ...s, stocks: { ...s.stocks, Food: 8000, 'Drinking water': 4 } };
  };

  it('sections come in order and deadlines never decrease within a section', () => {
    const s = crisis();
    const alerts = survivalAlerts(s, catalog, transitionForecast(s, catalog));
    const order = ALERT_GROUPS.map((g) => g.id);
    const groups = alerts.map((a) => order.indexOf(a.group!));
    expect(groups).toEqual([...groups].sort((a, b) => a - b));
    for (const g of order) {
      const days = alerts.filter((a) => a.group === g && a.id !== 'town-recovery').map((a) => a.days!);
      expect(days).toEqual([...days].sort((a, b) => a - b));
    }
    expect(alerts.filter((a) => a.group === 'now').map((a) => a.id)).toEqual(expect.arrayContaining(['food-runway', 'water-runway']));
  });

  it('today’s shortages are marked current and the forecast doesn’t repeat them', () => {
    const s = crisis();
    const alerts = survivalAlerts(s, catalog, transitionForecast(s, catalog));
    const heat = alerts.find((a) => a.id === 'heat')!;
    expect(heat.current).toBe(true);
    const fc = alerts.find((a) => a.id === 'forecast');
    expect(fc?.title ?? '').not.toContain('Heat falls short');
    expect(alerts.every((a) => !/ 1 days/.test(a.title))).toBe(true);
  });
});
