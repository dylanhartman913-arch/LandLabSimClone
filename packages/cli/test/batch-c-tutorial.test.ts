import { describe, expect, it } from 'vitest';
import { catalog, getQuestLine, SITES } from '@homestead/catalog';
import { gameDigest, replay } from '@homestead/engine';
import { noviceBot } from '../bots/novice.ts';
import { NEW_GAME_SETTINGS, playBot } from '../bots/run.ts';

describe('LL-58 visible instructions complete the tutorial, not just survival pacing', () => {
  for (const site of Object.keys(SITES)) for (const household of [2, 4]) {
    it(`${site}, ${household} adults: every quest completes through winter and the action log replays`, () => {
      const settings = { ...NEW_GAME_SETTINGS };
      const r = playBot(noviceBot({ react: false }), { start: 'greenfield', site, household, days: 365, settings });
      const line = getQuestLine('greenfield-instructions');
      expect(r.state.tutorial!.line).toBe(line.id);
      expect(Object.keys(r.state.tutorial!.done).sort()).toEqual(line.quests.map((q) => q.id).sort());
      expect(r.state.tutorial!.current).toBe(line.quests.length);
      expect(r.events.filter((e) => e.kind === 'went-to-town')).toEqual([]);
      expect(r.state.instances.filter((i) => i.person?.away)).toEqual([]);
      expect(r.actions.some((a) => a.kind === 'buy' && a.resource === 'Soil')).toBe(false);
      expect(gameDigest(replay(catalog, { siteId: site, seed: 1, start: { id: 'greenfield', difficulty: 'standard', household }, settings }, r.actions, 365))).toBe(gameDigest(r.state));
    });
  }
});
