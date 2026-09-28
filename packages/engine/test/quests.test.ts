import { describe, expect, it } from 'vitest';
import { MILESTONES, QUESTS, shortageHints } from '../src/index.ts';
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
