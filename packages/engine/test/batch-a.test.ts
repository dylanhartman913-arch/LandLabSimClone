import { describe, expect, it } from 'vitest';
import { SITES } from '@homestead/catalog';
import {
  applyAction, computeSpatial, gameDigest, occupancyView, projectPreview, replay,
  shelterAssignments, startGame, stepDay, stepDays, stockpileView, survivalAlerts,
  type GameInit, type GameState,
} from '../src/index.ts';
import { catalog, newGame, sysId } from './time-helpers.ts';

const residents = (s: GameState) => s.instances.filter((i) => i.person);
const shelterIds = (s: GameState) => s.instances.filter((i) => occupancyView(s, catalog, i.id)?.kind === 'shelter').map((i) => i.id);
const enable = (s: GameState) => applyAction(catalog, s, { kind: 'settings', at: s.calendar.absDay, settings: { householdCorrectness: true, shelterOccupancy: true } });
const initFor = (id: string, household: number, children = 0, siteId = 'front-range'): GameInit => ({
  siteId, seed: 1, start: { id, difficulty: 'standard', household, children },
  settings: { householdCorrectness: true, serviceWarmUp: true, cashFloor: true },
});

describe('LL-52 supplied homes serve the household when occupancy is enabled', () => {
  for (const site of Object.values(SITES)) it(`${site.id}: four adults retain their starting shelter coverage`, () => {
    const init = initFor('greenfield', 4, 0, site.id);
    const original = startGame(catalog, init);
    const occupied = enable(original);
    expect(new Set(shelterAssignments(catalog, occupied).values()).size).toBe(2);
    const base = stepDays(original, catalog, 3).ledgers.at(-1)!.needs.Shelter;
    const fixed = stepDays(occupied, catalog, 3).ledgers.at(-1)!.needs.Shelter;
    expect(fixed.needed).toBeCloseTo(base.needed);
    expect(fixed.delivered).toBeCloseTo(base.delivered);
    const actions = [{ kind: 'settings' as const, at: 0, settings: { shelterOccupancy: true } }];
    expect(gameDigest(replay(catalog, init, actions, 3))).toBe(gameDigest(stepDays(occupied, catalog, 3).state));
  });

  it('uses all supplied farm homes and minimizes unavoidable packing loss', () => {
    const s = enable(startGame(catalog, initFor('farm', 4, 3)));
    const homes = shelterIds(s).map((id) => occupancyView(s, catalog, id)!);
    expect(homes).toHaveLength(3);
    for (const home of homes) {
      expect(home.kind === 'shelter' && home.residents.length).toBeGreaterThan(0);

    }
    const n = stepDay(s, catalog).ledger.needs.Shelter;
    // 800 + 250 + 250 sq ft cannot pack 4 × 200 + 3 × 140 without a 20 sq ft gap.
    expect(n.needed).toBeCloseTo(1220);
    expect(n.delivered).toBeCloseTo(1200);
    const loaded = JSON.parse(JSON.stringify(s)) as GameState;
    expect(gameDigest(stepDay(loaded, catalog).state)).toBe(gameDigest(stepDay(s, catalog).state));
  });

  it('a supplied farm home with enough room is not overcrowded by children', () => {
    const s = enable(startGame(catalog, initFor('farm', 2, 2)));
    const home = occupancyView(s, catalog, shelterIds(s)[0]!)!;
    expect(home.kind === 'shelter' && home.need.value).toBeCloseTo(680);
    expect(home.kind === 'shelter' && home.capacity.value).toBe(800);
    expect(stepDay(s, catalog).ledger.needs.Shelter.delivered).toBeCloseTo(680);
  });

  it('keeps explicit assignments, including unassigned/removed homes, and never fills a bought home', () => {
    let s = startGame(catalog, initFor('greenfield', 4));
    const [p0, p1] = residents(s);
    s = { ...s, instances: s.instances.map((i) => i.id === p0!.id ? { ...i, shelterId: null } : i.id === p1!.id ? { ...i, shelterId: 'removed' } : i) };
    s = applyAction(catalog, s, { at: 0, kind: 'place', id: `i${s.nextInstanceId}`, systemId: sysId('Bell Tent'), x: 150, y: 150, mode: 'prebuilt' });
    const bought = s.instances.at(-1)!.id;
    s = enable(s);
    expect(residents(s).find((i) => i.id === p0!.id)!.shelterId).toBeNull();
    expect(residents(s).find((i) => i.id === p1!.id)!.shelterId).toBe('removed');
    expect([...shelterAssignments(catalog, s).values()]).not.toContain(bought);
    const assignments = residents(s).map((i) => i.shelterId);
    s = applyAction(catalog, s, { at: 0, kind: 'settings', settings: { shelterOccupancy: false } });
    expect(residents(enable(s)).map((i) => i.shelterId)).toEqual(assignments);
  });

  it('leaves legacy occupancy replays unchanged until a logged continuation upgrade', () => {
    const init = initFor('greenfield', 4);
    delete init.settings.householdCorrectness;
    init.settings.shelterOccupancy = true;
    const old = startGame(catalog, init);
    expect(new Set(shelterAssignments(catalog, old).values()).size).toBe(1);
    const action = { at: 3, kind: 'settings' as const, settings: { householdCorrectness: true } };
    const continued = applyAction(catalog, stepDays(old, catalog, 3).state, action);
    expect(new Set(shelterAssignments(catalog, continued).values()).size).toBe(2);
    expect(gameDigest(replay(catalog, init, [action], 5))).toBe(gameDigest(stepDays(continued, catalog, 2).state));
  });
});

describe('LL-53 role-adjusted figures agree with actual needs', () => {
  it('farm food HUD and coop preview use 3.4 adult equivalents', () => {
    const s = startGame(catalog, initFor('farm', 2, 2));
    const n = stepDay(s, catalog).ledger.needs.Food;
    expect(n.needed).toBeCloseTo(6800);
    const hud = stockpileView(s, catalog).find((r) => r.key === 'food')!;
    expect(hud.days.explain.refs?.dailyUse).toBeCloseTo(6800);
    const food = projectPreview(s, catalog, sysId('Chicken Coop (12 hens)'), 'prebuilt', { x: 150, y: 150 }).food!;
    expect(food.share.value).toBeCloseTo(food.daily.value / 6800);
    expect(food.perPerson.value).toBeCloseTo(food.daily.value / 3.4);
  });

  it('cabin space uses 820 sq ft for two adults and three children', () => {
    const s = enable(startGame(catalog, initFor('cabin', 2, 3)));
    const home = shelterIds(s)[0]!;
    const together = { ...s, instances: s.instances.map((i) => i.person ? { ...i, shelterId: home } : i) };
    const v = occupancyView(together, catalog, home)!;
    expect(v.kind === 'shelter' && v.need.value).toBeCloseTo(820);
    const n = stepDay(together, catalog).ledger.needs.Shelter;
    expect(n.needed).toBeCloseTo(820);
    expect(n.delivered).toBeCloseTo(700);
  });

  for (const rolesOn of [true, false]) it(`elders, scaled residents and people in town; roles ${rolesOn ? 'on' : 'off'}`, () => {
    let s = newGame({ 'Human Being': 4, 'Bell Tent': 1 }, { settings: { householdCorrectness: true, shelterOccupancy: true, householdRoles: rolesOn, startingStocks: { Food: 1e6 } } });
    const people = residents(s);
    s = { ...s, instances: s.instances.map((i) => i.id === people[0]!.id ? { ...i, scale: 2, person: { ...i.person!, role: 'child' as const } } : i.id === people[1]!.id ? { ...i, person: { ...i.person!, role: 'elder' as const } } : i.id === people[2]!.id ? { ...i, person: { ...i.person!, away: { since: 0 } } } : i) };
    const eq = rolesOn ? 2 * 0.7 + 0.9 + 1 : 4;
    const view = occupancyView(s, catalog, shelterIds(s)[0]!)!;
    expect(view.kind === 'shelter' && view.need.value).toBeCloseTo(eq * 200);
    const n = stepDay(s, catalog).ledger.needs;
    expect(n.Shelter.needed).toBeCloseTo(eq * 200);
    expect(n.Shelter.delivered).toBeCloseTo(210);
    expect(stockpileView(s, catalog).find((r) => r.key === 'food')!.days.explain.refs?.dailyUse).toBeCloseTo(eq * 2000);
    expect(projectPreview(s, catalog, sysId('Chicken Coop (12 hens)'), 'prebuilt', { x: 150, y: 150 }).food!.share.explain.refs?.household).toBeCloseTo(eq);
    expect(computeSpatial(catalog, s).get(people[0]!.id)!.assigned.Shelter!.share).toBeCloseTo(210 / (eq * 200));
  });
});

describe('LL-54 grocery routes and hunger warnings', () => {
  for (const site of Object.values(SITES)) it(`${site.id}: reliable funded groceries silence the empty-pantry warning`, () => {
    let s = startGame(catalog, initFor('farm', 2, 2, site.id));
    s = stepDays(s, catalog, 15).state;
    const before = gameDigest(s);
    expect(s.ledgers.at(-1)!.needs.Food.delivered).toBeCloseTo(6800);
    expect(survivalAlerts(s, catalog).some((a) => a.id === 'food-runway')).toBe(false);
    expect(gameDigest(s)).toBe(before);
    const noGrocery = { ...s, instances: s.instances.filter((i) => !catalog.systems.find((x) => x.id === i.systemId)!.backstopPrices.Food) };
    expect(survivalAlerts(noGrocery, catalog).some((a) => a.id === 'food-runway')).toBe(true);
    expect(survivalAlerts({ ...s, cash: 0 }, catalog).some((a) => a.id === 'food-runway')).toBe(true);
    expect(survivalAlerts({ ...s, settings: { ...s.settings, backstopCapMult: 0.01 } }, catalog).some((a) => a.id === 'food-runway')).toBe(true);
  });

  it('warns before a newly needed grocery bill exhausts cash, even while the pantry hides that expense', () => {
    let s = newGame({ 'Human Being': 2, 'Big Box Grocery Store': 1 }, {
      settings: { transportAccess: true, cashFloor: true, startingCash: 10000, startingStocks: { Food: 20000 } },
    });
    s = stepDay(s, catalog).state;
    s = { ...s, cash: 100 };
    expect(s.ledgers.at(-1)!.spend.backstop.Food ?? 0).toBe(0);
    expect(survivalAlerts(s, catalog).some((a) => a.id === 'food-runway')).toBe(true);
    expect(survivalAlerts({ ...s, cash: 10000 }, catalog).some((a) => a.id === 'food-runway')).toBe(false);
  });

  it('blocked roads keep the hunger warning even with cash and an installed grocery', () => {
    let s = stepDays(startGame(catalog, initFor('farm', 2, 2)), catalog, 15).state;
    s = { ...s, settings: { ...s.settings, riskEvents: true }, risks: {
      readiness: {}, threats: [{ id: 'roads', kind: 'blizzard', warnedAt: 10, startsAt: 14, endsAt: 20 }],
    } };
    expect(s.ledgers.at(-1)!.needs.Food.delivered).toBeCloseTo(6800);
    expect(survivalAlerts(s, catalog).some((a) => a.id === 'food-runway')).toBe(true);
  });

  it('an installed grocery without operating transport still warns before meals fail', () => {
    let s = newGame({ 'Human Being': 2, 'Big Box Grocery Store': 1 }, { settings: { cashFloor: true, startingCash: 10000, startingStocks: { Food: 16000 } } });
    s = stepDay(s, catalog).state;
    expect(s.ledgers.at(-1)!.needs.Food.delivered).toBeCloseTo(4000);
    expect(survivalAlerts(s, catalog).some((a) => a.id === 'food-runway')).toBe(true);
  });
});
