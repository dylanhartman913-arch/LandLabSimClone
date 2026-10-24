import { describe, expect, it } from 'vitest';
import { getQuestLine } from '@homestead/catalog';
import { MILESTONES, QUESTS, goalStatus, setStandingOrder, shortageHints, startGame } from '../src/index.ts';
import { catalog, newGame, place, run } from './time-helpers.ts';

const quest = (id: string) => QUESTS.find((q) => q.id === id)!;

describe('tutorial quests', () => {
  it('shelter two people: a tent is not enough, a yurt too makes it', () => {
    let g = run(newGame({ 'Human Being': 2, 'Bell Tent': 1 }), 1).state;
    expect(quest('shelter-two').check(g, catalog).done).toBe(false);
    g = run(place(g, 'Yurt', 150, 150).state, 1).state;
    expect(quest('shelter-two').check(g, catalog).done).toBe(true);
  });

  it('drinking water every day for a week, from a city hookup', () => {
    const g = newGame({ 'Human Being': 2, 'Municipal Water Hookup': 1 });
    expect(quest('water-week').check(run(g, 4).state, catalog)).toMatchObject({ done: false });
    expect(quest('water-week').check(run(g, 9).state, catalog).done).toBe(true);
  });

  it('cooking without bought fuel counts a solar oven but not a propane range', () => {
    const sun = run(newGame({ 'Human Being': 2, 'Concentrated Sunlight Oven': 1 }, { settings: { startDay: 120 } }), 9).state;
    expect(quest('cook-free').check(sun, catalog).done).toBe(true);
    const gas = run(
      newGame({ 'Human Being': 2, 'Propane Range': 1 }, { settings: { startDay: 120, startingStocks: { Propane: 50 } } }),
      9,
    ).state;
    expect(quest('cook-free').check(gas, catalog)).toMatchObject({ done: false, detail: expect.stringMatching(/bought fuel/) });
  });

  it('every quest names the checklist row it moves', () => {
    expect(QUESTS.map((q) => q.row)).toEqual(['Shelter', 'Drinking water', 'Cooking fuel', 'Heated shelter', 'Food', 'Food']);
  });
});

describe('milestones and hints', () => {
  it('a tent camp earns no milestones in a week', () => {
    const g = run(newGame({ 'Human Being': 1, 'Bell Tent': 1 }), 7).state;
    expect(MILESTONES.filter((m) => m.check(g, catalog))).toEqual([]);
  });

  it('a week without water brings a hint with systems to try', () => {
    const g = run(newGame({ 'Human Being': 1, 'Bell Tent': 1 }, { settings: { startingStocks: {} } }), 8).state;
    const hint = shortageHints(g, catalog).find((h) => h.resource === 'Water')!;
    expect(hint.fixes.length).toBeGreaterThanOrEqual(2);
    expect(hint.fixes[0]!.costPerUnitCovered).toBeLessThanOrEqual(hint.fixes.at(-1)!.costPerUnitCovered);
    expect(hint.fixes.every((f) => Array.isArray(f.needs))).toBe(true);
  });
});

describe('LL-18: the seasonal greenfield line keeps teaching through the season', () => {
  const seasons = getQuestLine('greenfield-seasons');
  const legacy = getQuestLine('greenfield');
  const init = (settings: Record<string, boolean>) => ({ siteId: 'front-range', seed: 1, settings, start: { id: 'greenfield', difficulty: 'standard' as const, household: 2 } });

  it('new games get the seasonal line; saved games keep the line they started with', () => {
    expect(startGame(catalog, init({ tutorialSeasons: true })).tutorial!.line).toBe('greenfield-seasons');
    expect(startGame(catalog, init({})).tutorial!.line).toBe('greenfield');
  });

  it('every standing order a quest sets is named in its own text', () => {
    for (const q of seasons.quests)
      for (const s of q.steps) if (s.do === 'standing') expect(q.reason, `${q.id} sets ${s.resource}`).toContain(s.resource);
  });

  it('Show me opens the system a quest builds', () => {
    for (const q of seasons.quests) {
      const built = q.steps.find((s) => s.do === 'place');
      if (built && built.do === 'place') expect(q.show, q.id).toEqual({ kind: 'system', name: built.system });
    }
  });

  it('the neighbor’s assistance totals are unchanged', () => {
    const total = (qs: typeof seasons.quests) => {
      const t: Record<string, number> = { cash: 0 };
      for (const q of qs) {
        t.cash! += q.reward.cash;
        for (const [r, v] of Object.entries(q.reward.stock)) t[r] = (t[r] ?? 0) + v;
      }
      return t;
    };
    expect(total(seasons.quests)).toEqual(total(legacy.quests));
  });

  it('warmth is judged by the residents at home, not every shelter’s full heat need', () => {
    const s = run(newGame({ 'Human Being': 2, 'Canvas Wall Tent + Stove Jack': 1 }, { settings: { startDay: 0 } }), 1).state;
    const l = s.ledgers[0]!;
    const day = (absDay: number, share: number, home = true) => ({
      ...l,
      absDay,
      wellbeing: home ? 70 : null,
      weather: { ...l.weather, hdd: 30 },
      needs: { ...l.needs, 'Heated shelter': { ...l.needs['Heated shelter'], needed: 100, delivered: 100 * share } },
    });
    // A second, unheated tent: 57% of all shelters' heat, nobody below the survival level.
    const cold = { ...s, ledgers: [day(1, 0.57), day(2, 0.57), day(3, 0.57)] };
    expect(goalStatus(cold, catalog, { kind: 'staysWarm', hddAbove: 22, days: 3 }, 1).done).toBe(true);
    expect(goalStatus(cold, catalog, { kind: 'warm', hddAbove: 22, atLeast: 0.8, days: 3 }, 1).done).toBe(false);
    const away = { ...s, ledgers: [day(1, 1, false), day(2, 1, false), day(3, 1, false)] };
    expect(goalStatus(away, catalog, { kind: 'staysWarm', hddAbove: 22, days: 3 }, 1).done).toBe(false);
  });

  it('a standing-order goal is met by the order, not the stock', () => {
    let s = newGame({ 'Human Being': 1 });
    expect(goalStatus(s, catalog, { kind: 'standing', resource: 'Carbon' }, 0).done).toBe(false);
    s = setStandingOrder(catalog, s, 'Carbon', 40, 120);
    expect(goalStatus(s, catalog, { kind: 'standing', resource: 'Carbon' }, 0).done).toBe(true);
  });
});
