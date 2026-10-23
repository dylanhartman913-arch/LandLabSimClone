import { describe, expect, it } from 'vitest';
import { currentQuest, survivalAlerts, transitionForecast } from '@homestead/engine';
import { playBot } from '../bots/index.ts';
import { doStep } from '../bots/steps.ts';
import { NEW_GAME_SETTINGS } from '../bots/compare.ts';
import type { Bot } from '../bots/types.ts';

/** The Oct 22 playtest's novice: each quest's own steps, but none of the standing orders the text never mentions. */
function novice(top: { day: number; id: string }[]): Bot {
  const done = new Set<string>();
  let start = -1;
  let forecast: ReturnType<typeof transitionForecast> | undefined;
  return {
    name: 'novice',
    act(catalog, state, log) {
      if (start < 0) start = state.calendar.absDay;
      const q = currentQuest(state);
      if (q && !done.has(q.id)) {
        done.add(q.id);
        for (const step of q.steps) if (step.do !== 'standing') state = doStep(catalog, state, step, log, []);
      }
      const day = state.calendar.absDay - start;
      // As the hint card does: the projection refreshes weekly.
      if (day % 7 === 0) forecast = transitionForecast(state, catalog);
      const first = survivalAlerts(state, catalog, forecast)[0];
      if (first) top.push({ day, id: first.id });
      return state;
    },
  };
}

describe('LL-15: the novice who never set up supplies is warned well before the pantry and sawdust run out', () => {
  it('the top alert forecasts the collapse a month ahead, and names food a week ahead', () => {
    const top: { day: number; id: string }[] = [];
    const r = playBot(novice(top), { start: 'greenfield', site: 'front-range', days: 100, settings: NEW_GAME_SETTINGS });
    const harm = r.ledgers.findIndex((l, k) => k > 3 && l.needs.Food.delivered / l.needs.Food.needed < 0.5);
    expect(harm).toBeGreaterThan(30);
    const forecast = top.find((t) => t.id === 'forecast')!;
    expect(harm - forecast.day).toBeGreaterThanOrEqual(30);
    const food = top.find((t) => t.id === 'food-runway')!;
    expect(harm - food.day).toBeGreaterThanOrEqual(5);
    // Exhausted chicken feed (production only) never outranks the survival warnings.
    expect(top.filter((t) => t.day >= forecast.day && t.day < harm).every((t) => t.id !== 'Chicken feed')).toBe(true);
  });
});
