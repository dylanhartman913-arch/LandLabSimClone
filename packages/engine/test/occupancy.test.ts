import { describe, expect, it } from 'vitest';
import {
  applyAction,
  closeShelter,
  computeSpatial,
  gameDigest,
  heatShare,
  occupancyView,
  replay,
  projectPreview,
  returnChecks,
  setShelter,
  shelterAssignments,
  startGame,
  stepDay,
  stepDays,
  systemCard,
  type Action,
  type GameState,
} from '../src/index.ts';
import { catalog, newGame, sysId } from './time-helpers.ts';

function fixture(personCount = 2, shelters = 2): GameState {
  const s = newGame(
    { 'Human Being': personCount, 'Bell Tent': shelters, 'Tiny Wood Stove': 8 },
    {
      settings: {
        shelterOccupancy: true,
        startingStocks: { Food: 1e7, 'Drinking water': 10000, 'Woody biomass': 10000 },
      },
    },
  );
  let home = 0;
  const positioned = {
    ...s,
    instances: s.instances.map((i) => ({
      ...i,
      x: i.systemId === sysId('Bell Tent') ? 50 + home++ * 150 : 50,
      y: 50,
    })),
  };
  const sheltersList = homes(positioned);
  return people(positioned).reduce(
    (s, p, k) => setShelter(catalog, s, p.id, sheltersList[k % sheltersList.length]!.id),
    positioned,
  );
}
const people = (s: GameState) => s.instances.filter((i) => i.person);
const homes = (s: GameState) => s.instances.filter((i) => i.systemId === sysId('Bell Tent'));
const putAll = (s: GameState, home: string) =>
  people(s).reduce((s, p) => setShelter(catalog, s, p.id, home), s);
const bag = (s: GameState, id: string) => s.ledgers.at(-1)!.shelters!.find((sh) => sh.id === id)!;

describe('LL-32 shelter occupancy', () => {
  it('assigns deterministically, honors explicit moves, and shares space only with housemates', () => {
    const original = fixture();
    const before = gameDigest(original);
    const auto = {
      ...original,
      instances: original.instances.map((i) => {
        const copy = { ...i };
        delete copy.shelterId;
        return copy;
      }),
    };
    const assigned = shelterAssignments(catalog, auto);
    expect(new Set(assigned.values()).size).toBe(1);
    expect([...assigned.values()][0]).toBe(homes(auto)[0]!.id);
    const home = homes(original)[0]!.id;
    const crowded = putAll(original, home);
    const spatial = computeSpatial(catalog, crowded);
    for (const p of people(crowded))
      expect(spatial.get(p.id)!.assigned.Shelter!.share).toBeCloseTo(210 / 400);
    expect(gameDigest(original)).toBe(before);
    const split = setShelter(catalog, crowded, people(crowded)[1]!.id, homes(crowded)[1]!.id);
    for (const p of people(split))
      expect(computeSpatial(catalog, split).get(p.id)!.assigned.Shelter!.share).toBe(1);
  });

  it('empty shelters have zero thermal demand and closing keeps only small upkeep and no living space', () => {
    let s = fixture();
    const [warm, empty] = homes(s);
    s = putAll(s, warm!.id);
    const open = stepDay(s, catalog);
    const closedState = closeShelter(catalog, s, empty!.id, true);
    const closed = stepDay(closedState, catalog);
    expect(bag(open.state, empty!.id).heatNeeded).toBe(0);
    expect(bag(closed.state, empty!.id).heatNeeded).toBe(0);
    const card = systemCard(closed.state, catalog, empty!.systemId, empty!.id);
    expect(card.outputs.find((o) => o.view.resource === 'Shelter')!.produced.value).toBe(0);
    const upkeep = (state: GameState) =>
      systemCard(state, catalog, empty!.systemId, empty!.id).inputs.find((i) => i.view.resource === 'Labor')!
        .needed.value;
    expect(upkeep(closed.state)).toBeCloseTo(upkeep(open.state) * 0.1);
    expect(closed.ledger.labor.upkeepRequested).toBeLessThan(open.ledger.labor.upkeepRequested);
    expect(occupancyView(closed.state, catalog, empty!.id)!.kind).toBe('shelter');
    const reopened = closeShelter(catalog, closedState, empty!.id, false);
    expect(
      setShelter(catalog, reopened, people(s)[0]!.id, empty!.id).instances.find((i) => i.person)!.shelterId,
    ).toBe(empty!.id);
  });

  it('rejects closing assigned shelters, assigning closed/building/non-shelters, and disabled actions', () => {
    const s = fixture();
    const [first, second] = homes(s);
    expect(() => closeShelter(catalog, s, first!.id, true)).toThrow('Move all');
    const moved = putAll(s, first!.id);
    const closed = closeShelter(catalog, moved, second!.id, true);
    expect(() => setShelter(catalog, closed, people(s)[0]!.id, second!.id)).toThrow('completed, open');
    expect(() => setShelter(catalog, s, people(s)[0]!.id, people(s)[1]!.id)).toThrow('completed, open');
    const building = {
      ...moved,
      instances: moved.instances.map((i) =>
        i.id === second!.id ? { ...i, status: 'building' as const } : i,
      ),
    };
    expect(() => setShelter(catalog, building, people(s)[0]!.id, second!.id)).toThrow('completed, open');
    expect(() =>
      closeShelter(
        catalog,
        { ...moved, settings: { ...moved.settings, shelterOccupancy: false } },
        second!.id,
        true,
      ),
    ).toThrow();
  });

  it('heat reaches only the nearby occupied home and the cold resident blocks warmth credit', () => {
    const s = fixture();
    const result = stepDays(s, catalog, 5);
    const [warm, cold] = homes(s);
    expect(bag(result.state, warm!.id).heatReceived).toBeGreaterThan(0);
    expect(bag(result.state, cold!.id).heatReceived).toBe(0);
    expect(bag(result.state, cold!.id).heatNeeded).toBeGreaterThan(0);
    const assigned = shelterAssignments(catalog, s);
    const warmPerson = people(result.state).find((p) => assigned.get(p.id) === warm!.id)!;
    const coldPerson = people(result.state).find((p) => assigned.get(p.id) === cold!.id)!;
    expect(warmPerson.person!.short.heat).toBe(0);
    expect(coldPerson.person!.short.heat).toBe(5);
    expect(heatShare(result.ledgers.at(-1)!)).toBe(0);
    const last = result.ledgers.at(-1)!;
    expect(last.resources.Heat!.produced).toBeGreaterThan(last.needs['Heated shelter'].needed);
    for (const l of result.ledgers) {
      expect(l.resources.Heat!.consumed).toBeLessThanOrEqual(l.resources.Heat!.start + 1e-7);
      expect(l.shelters!.reduce((n, sh) => n + sh.heatReceived, 0)).toBeCloseTo(l.resources.Heat!.consumed);
    }
  });

  it('a heater at an empty tent cannot warm distant residents; moving residents restores local heat', () => {
    let s = fixture();
    const [near, far] = homes(s);
    s = putAll(s, far!.id);
    const cold = stepDays(s, catalog, 4);
    expect(cold.ledgers.at(-1)!.residentShares!.heat).toBe(0);
    expect(bag(cold.state, near!.id).heatNeeded).toBe(0);
    expect(cold.ledgers.at(-1)!.resources.Heat!.undelivered).toBeGreaterThan(0);
    const warm = stepDays(putAll(cold.state, near!.id), catalog, 4);
    expect(warm.ledgers.at(-1)!.residentShares!.heat).toBeGreaterThan(0.6);
    expect(heatShare(warm.ledgers.at(-1)!)).toBeGreaterThan(0.6);
  });

  it('splits a shared source once across two reachable homes rather than duplicating it', () => {
    let s = fixture();
    const [a, b] = homes(s);
    s = { ...s, instances: s.instances.map((i) => (i.id === b!.id ? { ...i, x: 65 } : i)) };
    const result = stepDays(s, catalog, 2);
    const thermal = result.state.shelterThermal!;
    expect(thermal[a!.id]!.Heat).toBeGreaterThan(0);
    expect(thermal[b!.id]!.Heat).toBeGreaterThan(0);
    expect(thermal[a!.id]!.Heat! + thermal[b!.id]!.Heat!).toBeCloseTo(
      result.ledgers.at(-1)!.resources.Heat!.produced,
    );
  });

  it('project forecasts keep a spare tent empty and cannot offset a cold home with distant surplus', () => {
    const s = fixture();
    const spare = projectPreview(s, catalog, sysId('Bell Tent'), 'prebuilt', { x: 100, y: 150 });
    expect(spare.winter).not.toBeNull();
    expect(spare.winter!.added.value).toBeCloseTo(0);
    expect(spare.winter!.gap.value).toBeGreaterThan(0);
    expect(spare.winter!.closes.value).toBe(0);
  });

  it('condition loss reduces the assigned living space and the shelter card together', () => {
    let s = fixture(1, 1);
    const home = homes(s)[0]!;
    s = { ...s, settings: { ...s.settings, wearAndRepair: true }, instances: s.instances.map((i) => i.id === home.id ? { ...i, condition: 0 } : i) };
    const view = occupancyView(s, catalog, home.id)!;
    expect(view.kind === 'shelter' && view.capacity.value).toBe(0);
    expect(systemCard(s, catalog, home.systemId, home.id).outputs.find((o) => o.view.resource === 'Shelter')!.produced.value).toBe(0);
    expect(stepDay(s, catalog).ledger.residentShares!.shelter).toBe(0);
  });

  it('cooling is local too, and yesterday’s receipts stop when the source loses power', () => {
    let s = fixture();
    s = { ...s, calendar: { day: 200, year: 0, absDay: 0 }, stocks: { ...s.stocks, Electricity: 100000 },
      instances: s.instances.map((i) => i.systemId === sysId('Tiny Wood Stove') ? { ...i, systemId: sysId('Heat Pump (Mini-Split)') } : i) };
    const two = stepDays(s, catalog, 2);
    const [near, far] = homes(s);
    expect(two.ledgers[1]!.weather.cdd).toBeGreaterThan(0);
    expect(bag(two.state, near!.id).coolingReceived).toBeGreaterThan(0);
    expect(bag(two.state, far!.id).coolingReceived).toBe(0);
    expect(two.ledgers[1]!.residentShares!.cooling).toBe(0);
    const three = stepDay(two.state, catalog);
    expect(bag(three.state, near!.id).coolingReceived).toBe(0);
  });

  it('closing reduces actual capital bills without removing the physical roof', () => {
    const s = newGame({ 'Human Being': 1, 'Bell Tent': 1, 'Passive House (Certified)': 1 }, { settings: { shelterOccupancy: true, startingCash: 1000000 } });
    const sh = s.instances.find((i) => i.systemId === sysId('Passive House (Certified)'))!;
    const open = stepDay(s, catalog);
    const closed = stepDay(closeShelter(catalog, s, sh.id, true), catalog);
    expect(closed.ledger.spend.running![sh.systemId]).toBeCloseTo(open.ledger.spend.running![sh.systemId]! * 0.1);
    const roof = (state: GameState) => systemCard(state, catalog, sh.systemId, sh.id).outputs.find((o) => o.view.resource === 'Roofing area')!.produced.value;
    expect(roof(closed.state)).toBe(roof(open.state));
    expect(roof(closed.state)).toBeGreaterThan(0);
  });

  it('reserves assignments for people in town while stopping their thermal loads', () => {
    let s = fixture(1, 1);
    const p = people(s)[0]!;
    const sh = homes(s)[0]!;
    s = setShelter(catalog, s, p.id, sh.id);
    s = {
      ...s,
      instances: s.instances.map((i) =>
        i.id === p.id ? { ...i, person: { ...i.person!, away: { since: 0 } } } : i,
      ),
    };
    expect(() => closeShelter(catalog, s, sh.id, true)).toThrow('Move all');
    expect(bag(stepDay(s, catalog).state, sh.id).heatNeeded).toBe(0);
    expect(shelterAssignments(catalog, s).get(p.id)).toBe(sh.id);
  });

  it('does not silently relocate explicitly assigned people after their shelter is removed', () => {
    let s = fixture();
    const p = people(s)[0]!;
    const sh = homes(s)[0]!;
    s = setShelter(catalog, s, p.id, sh.id);
    s = { ...s, instances: s.instances.filter((i) => i.id !== sh.id) };
    expect(shelterAssignments(catalog, s).get(p.id)).toBeNull();
    const day = stepDay(s, catalog);
    expect(day.ledger.residentShares!.shelter).toBe(0);
    expect(day.ledger.residentShares!.heat).toBe(0);
  });

  it('checks each returning resident’s own heat instead of pooled spare supply', () => {
    let s = fixture();
    s = {
      ...s,
      settings: { ...s.settings, unlimitedSupply: true },
      instances: s.instances.map((i) =>
        i.person ? { ...i, person: { ...i.person, away: { since: -20 } } } : i,
      ),
    };
    // Ordinary-supply trial must reject the distant home even with ample food and water.
    s = { ...s, settings: { ...s.settings, unlimitedSupply: false } };
    expect(returnChecks(s, catalog).some((c) => c.startsWith('Heat fails'))).toBe(true);
  });

  it('gating off restores legacy behavior and replay/save preserve assignments and thermal receipts', () => {
    const s = fixture();
    const legacy = { ...s, settings: { ...s.settings, shelterOccupancy: false } };
    const marked = {
      ...legacy,
      instances: legacy.instances.map((i) => ({ ...i, shelterClosed: true, shelterId: null })),
    };
    const a = stepDay(legacy, catalog),
      b = stepDay(marked, catalog);
    expect(a.ledger).toEqual(b.ledger);
    expect(a.state.stocks).toEqual(b.state.stocks);
    expect(a.ledger.shelters).toBeUndefined();
    const init = { siteId: 'front-range', seed: 1, settings: { shelterOccupancy: true } };
    let state = startGame(catalog, init);
    const actions: Action[] = [];
    for (const name of ['Human Being', 'Bell Tent', 'Bell Tent']) {
      const action: Action = {
        kind: 'place',
        at: 0,
        id: `i${state.nextInstanceId}`,
        systemId: sysId(name),
        x: 50 + actions.length * 30,
        y: 50,
        mode: 'prebuilt',
      };
      state = applyAction(catalog, state, action);
      actions.push(action);
    }
    for (const action of [
      { kind: 'assignShelter', at: 0, id: state.instances[0]!.id, shelterId: state.instances[1]!.id },
      { kind: 'closeShelter', at: 0, id: state.instances[2]!.id, closed: true },
    ] satisfies Action[]) {
      state = applyAction(catalog, state, action);
      actions.push(action);
    }
    const end = stepDays(state, catalog, 4).state;
    expect(gameDigest(replay(catalog, init, actions, 4))).toBe(gameDigest(end));
    expect(gameDigest(stepDay(JSON.parse(JSON.stringify(end)) as GameState, catalog).state)).toBe(
      gameDigest(stepDay(end, catalog).state),
    );
    const off = applyAction(catalog, end, { at: 4, kind: 'settings', settings: { shelterOccupancy: false } });
    expect(off.shelterThermal).toBeUndefined();
  });
});
