import { describe, expect, it } from 'vitest';
import { costFor, removeSystem, setupHoursFor, setPriority, canPlace } from '../src/index.ts';
import { advanceTo, catalog, eventsOf, need, newGame, place, run, sysId } from './time-helpers.ts';

describe('scenarios that read like the game', () => {
  it('no stove in January: heated shelter goes unmet and a hardship event fires', () => {
    const g = newGame({ 'Human Being': 1, 'Bell Tent': 1 });
    const { events, ledgers } = run(g, 10); // Jan 1-10
    expect(need(ledgers, 'Heated shelter').needed).toBeGreaterThan(0);
    expect(need(ledgers, 'Heated shelter').delivered).toBe(0);
    const hardship = eventsOf(events, 'hardship').filter((e) => e.need === 'heat');
    expect(hardship.length).toBeGreaterThan(0);
    expect(hardship[0]!.absDay).toBe(2); // third cold day in a row
  });

  it('wood stoves with a woodpile keep the tent warm in January', () => {
    const g = newGame(
      { 'Human Being': 1, 'Bell Tent': 1, 'Tiny Wood Stove': 4 },
      { settings: { startingStocks: { 'Woody biomass': 5000, Food: 28000, 'Drinking water': 20 } } },
    );
    const { ledgers, events } = run(g, 10);
    expect(need(ledgers.slice(1), 'Heated shelter').pct).toBeGreaterThan(0.99);
    expect(eventsOf(events, 'hardship').filter((e) => e.need === 'heat')).toHaveLength(0);
  });

  it('3 panels, no battery: the noon surplus spills and is counted, night demand goes unmet', () => {
    let g = advanceTo(newGame({ 'Human Being': 1 }), 170); // June
    for (const x of [20, 40, 60]) g = place(g, '500W Photovoltaic Panels', x, 20).state;
    const { ledgers, events } = run(g, 14);
    const days = ledgers.slice(1); // day one has no yesterday's output
    const spilled = days.reduce((a, l) => a + l.resources['Electricity']!.spilled, 0);
    const produced = days.reduce((a, l) => a + l.resources['Electricity']!.produced, 0);
    expect(spilled).toBeGreaterThan(0.3 * produced);
    // Daytime loads (half of demand) run off the panels; the night half has no battery.
    expect(need(days, 'Electricity').pct).toBeCloseTo(0.5, 6);
    expect(eventsOf(events, 'spill')).toHaveLength(1);
  });

  it('adding a battery bank stores the surplus for the night', () => {
    const g = advanceTo(
      newGame({ 'Human Being': 1, '500W Photovoltaic Panels': 3, 'LiFePO4 Battery Bank (10 kWh)': 1 }),
      170,
    );
    const { ledgers } = run(g, 14);
    expect(need(ledgers.slice(2), 'Electricity').pct).toBeGreaterThan(0.99);
  });

  it('a raised bed with no water yields nothing and is named in the water shortage', () => {
    const g0 = newGame(
      { 'Human Being': 1 },
      {
        settings: {
          startingStocks: {
            Seeds: 5,
            Compost: 500,
            'Liquid fertilizer': 10,
            Food: 400000,
            'Drinking water': 50,
          },
        },
      },
    );
    // Plant in early June, inside the front-range growing season.
    const { state: inSeason, instanceId: bed } = place(advanceTo(g0, 150), 'Raised Beds (24 sq ft)', 20, 20);
    const { ledgers, events } = run(inSeason, 30);
    const veg = ledgers.reduce((a, l) => a + l.resources['Vegetables fruit fiber herbs']!.produced, 0);
    expect(veg).toBe(0);
    const shortage = eventsOf(events, 'shortage').find((e) => e.resource === 'Water');
    expect(shortage?.curtailed).toContain(bed);
  });

  it('the same raised bed with a well and power grows vegetables', () => {
    const g0 = newGame(
      { 'Human Being': 1, Well: 1, '500W Photovoltaic Panels': 2, 'LiFePO4 Battery Bank (10 kWh)': 1 },
      {
        settings: {
          startingStocks: {
            Seeds: 5,
            Compost: 500,
            'Liquid fertilizer': 10,
            Food: 400000,
            'Drinking water': 50,
          },
        },
      },
    );
    let g = setPriority(g0, g0.instances.find((i) => i.systemId === sysId('Well'))!.id, 0);
    g = place(g, 'Raised Beds (24 sq ft)', 150, 150).state;
    const { ledgers } = run(advanceTo(g, 150), 30);
    const veg = ledgers.reduce((a, l) => a + l.resources['Vegetables fruit fiber herbs']!.produced, 0);
    expect(veg).toBeGreaterThan(0);
  });

  it('people are served before the well, so raising the well’s priority restores water', () => {
    const base = { 'Human Being': 1, Well: 1, '500W Photovoltaic Panels': 1 };
    const g = advanceTo(newGame(base), 170);
    const water = (s: typeof g) => need(run(s, 14).ledgers.slice(2), 'Water').pct;
    expect(water(g)).toBeLessThan(0.05);
    const well = g.instances.find((i) => i.systemId === sysId('Well'))!.id;
    expect(water(setPriority(g, well, 0))).toBeGreaterThan(0.99);
  });

  it('people eat eggs and vegetables when the pantry of bought food runs out', () => {
    const g = newGame(
      { 'Human Being': 1 },
      { settings: { startingStocks: { Food: 0, Eggs: 300, 'Drinking water': 50 } } },
    );
    const { ledgers } = run(g, 7);
    expect(ledgers.reduce((a, l) => a + l.resources['Eggs']!.consumed, 0)).toBeGreaterThan(0);
    expect(need(ledgers, 'Food').delivered).toBeGreaterThan(0);
  });

  it('eggs spoil 3% a week on the shelf and much slower in a root cellar', () => {
    const shelf = run(newGame({}, { settings: { startingStocks: { Eggs: 100 } } }), 7).state;
    const cellar = run(
      newGame({ 'Root Cellar': 1 }, { settings: { startingStocks: { Eggs: 100 } } }),
      7,
    ).state;
    expect(shelf.stocks['Eggs']).toBeCloseTo(100 * (1 - 0.03 / 7) ** 7, 9);
    expect(cellar.stocks['Eggs']!).toBeGreaterThan(shelf.stocks['Eggs']!);
    expect(100 - cellar.stocks['Eggs']!).toBeCloseTo((100 - shelf.stocks['Eggs']!) * 0.2, 1);
  });

  it('water beyond the tank spills', () => {
    const g = advanceTo(newGame({ 'Human Being': 1, Well: 1, 'Portable Gas Generator (3.5 kW)': 0 }), 0);
    const { ledgers } = run(g, 3);
    const stock = ledgers.at(-1)!;
    expect(stock.resources['Water']!.start + stock.resources['Drinking water']!.start).toBeLessThanOrEqual(
      50 + 1e-9,
    );
  });

  it('a household with no cash cannot shop', () => {
    const g = newGame(
      { 'Human Being': 1, 'Big Box Grocery Store': 1, 'Cargo Bike': 1 },
      { settings: { startingCash: 0, startingStocks: { Food: 50000, 'Drinking water': 50 } } },
    );
    const { ledgers, events } = run(g, 5);
    // The grocery is a backstop (G12): it sells on demand, but not to an empty wallet.
    expect(ledgers.every((l) => l.resources['Food']!.purchased === 0)).toBe(true);
    expect(eventsOf(events, 'purchases-stopped')).toHaveLength(0); // the pantry still has food
    const hungry = run(newGame({ 'Human Being': 1, 'Big Box Grocery Store': 1, 'Cargo Bike': 1 }, { settings: { startingCash: 0, startingStocks: {} } }), 3);
    expect(hungry.ledgers.every((l) => l.resources['Food']!.purchased === 0)).toBe(true);
    expect(eventsOf(hungry.events, 'purchases-stopped')).toHaveLength(1);
  });
});

describe('construction', () => {
  it('buying needs a quarter of the setup hours; building it yourself needs all of them', () => {
    const yurt = sysId('Yurt');
    expect(setupHoursFor(catalog, yurt, 'buy')).toBe(10);
    expect(setupHoursFor(catalog, yurt, 'diy')).toBe(40);
    expect(costFor(catalog, yurt, 'buy')).toBe(18000);
    expect(costFor(catalog, yurt, 'diy')).toBe(6000);
  });

  it('a yurt built by one person finishes and fires a built event', () => {
    const g0 = newGame({ 'Human Being': 1 });
    const { state: g, instanceId } = place(g0, 'Yurt', 60, 60, 'diy');
    expect(g.cash).toBe(g0.cash - 6000);
    const { events, state } = run(g, 20);
    const built = eventsOf(events, 'built').find((e) => e.instanceId === instanceId);
    expect(built).toBeDefined();
    // 40 h at 60% of ~7.1 h/day ≈ 9.4 days
    expect(built!.absDay).toBeGreaterThanOrEqual(8);
    expect(built!.absDay).toBeLessThanOrEqual(12);
    expect(state.instances.find((i) => i.id === instanceId)!.status).toBe('active');
  });

  it('removing a system refunds everything while building and a quarter once built', () => {
    const g0 = newGame({ 'Human Being': 1 });
    const { state: g, instanceId } = place(g0, 'Yurt', 60, 60, 'buy');
    expect(removeSystem(g, instanceId).cash).toBe(g0.cash);
    const built = run(g, 10).state;
    expect(removeSystem(built, instanceId).cash - built.cash).toBe(18000 * 0.25);
  });

  it('missing materials are brought in and recorded', () => {
    const g0 = newGame({ 'Human Being': 1 });
    const { state: g } = place(g0, 'Raised Beds (24 sq ft)', 30, 30, 'buy');
    const { ledgers, events } = run(g, 1);
    expect(ledgers[0]!.resources['Soil']!.imported).toBe(24);
    expect(eventsOf(events, 'imported')[0]).toMatchObject({ resource: 'Soil', amount: 24 });
  });

  it('a newly planted apple tree grows into its harvest over five years', () => {
    const g0 = newGame({
      'Human Being': 1,
      Well: 1,
      'Rooftop Solar Array (6 kW)': 1,
      'LiFePO4 Battery Bank (10 kWh)': 1,
    });
    const { state: g } = place(g0, 'Apple Tree', 150, 150, 'diy');
    const apples = (days: ReturnType<typeof run>['ledgers']) =>
      days.reduce((a, l) => a + l.resources['Vegetables fruit fiber herbs']!.produced, 0);
    const y1 = run(g, 365);
    const y2 = run(y1.state, 365);
    expect(apples(y1.ledgers)).toBeGreaterThan(0);
    expect(apples(y2.ledgers)).toBeGreaterThan(apples(y1.ledgers) * 1.5);
    expect(apples(y2.ledgers)).toBeLessThan(150 * 0.5);
  });
});

describe('placement', () => {
  it('rejects overlapping footprints and spots outside the parcel', () => {
    const g0 = newGame({});
    const { state: g } = place(g0, 'Yurt', 50, 50);
    expect(canPlace(catalog, g, sysId('Yurt'), 55, 55).ok).toBe(false);
    expect(canPlace(catalog, g, sysId('Yurt'), 205, 100).ok).toBe(false);
    expect(canPlace(catalog, g, sysId('Yurt'), 100, 100).ok).toBe(true);
  });

  it('lets a chicken coop sit on a pasture but not two pastures overlap', () => {
    const g = newGame({}, { settings: { parcelAcres: 2 } });
    const { state: withPasture } = place(g, 'Pasture (1 acre)', 105, 105);
    expect(canPlace(catalog, withPasture, sysId('Chicken Coop (12 hens)'), 100, 100).ok).toBe(true);
    expect(canPlace(catalog, withPasture, sysId('Pasture (1 acre)'), 150, 150).ok).toBe(false);
  });
});
