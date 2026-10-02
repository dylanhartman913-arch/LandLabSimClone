import { currentQuest } from '@homestead/engine';
import { doStep } from './steps.ts';
import type { Bot } from './types.ts';

/** Completes the current quest the cheapest way the quest itself suggests (its steps), then waits. */
export function tutorialFollowerBot(): Bot {
  const doneSteps = new Set<string>();
  const skipped: string[] = [];
  return {
    name: 'tutorialFollower',
    act(catalog, state, log) {
      const q = currentQuest(state);
      if (!q || doneSteps.has(q.id)) return state;
      doneSteps.add(q.id);
      for (const step of q.steps) state = doStep(catalog, state, step, log, skipped);
      // A UI goal (open the Market panel) is something a bot "does" by acting on it.
      if (q.goal.kind === 'ui') state = doStep(catalog, state, { do: 'open', panel: q.goal.panel }, log, skipped);
      return state;
    },
  };
}
