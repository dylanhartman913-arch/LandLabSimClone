import { getQuestLine } from '@homestead/catalog';
import { doStep } from './steps.ts';
import type { Bot } from './types.ts';

/** Adapt path: one project a month from the adapt tutorial's list, in order. */
export function adaptUpgraderBot(): Bot {
  const skipped: string[] = [];
  let started: number | null = null;
  let next = 0;
  return {
    name: 'adaptUpgrader',
    act(catalog, state, log) {
      started ??= state.calendar.absDay;
      const line = getQuestLine('adapt');
      const due = Math.floor((state.calendar.absDay - started) / 30);
      while (next <= due && next < line.quests.length) {
        const q = line.quests[next]!;
        for (const step of q.steps) state = doStep(catalog, state, step, log, skipped);
        if (q.goal.kind === 'ui') state = doStep(catalog, state, { do: 'open', panel: q.goal.panel }, log, skipped);
        next++;
      }
      return state;
    },
  };
}
