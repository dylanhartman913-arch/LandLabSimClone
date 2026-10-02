import { describe, expect, it } from 'vitest';
import { GATES, playBot, greedyBot, runGates } from '../bots/index.ts';

describe('pacing gates (G16): the playtest bots on 3 sites × 3 seeds', () => {
  for (const gate of GATES) {
    it(`${gate.id}: ${gate.bot} — ${gate.rule}`, () => {
      for (const r of runGates({ gates: [gate] })) {
        const misses = r.runs.filter((x) => !x.pass).map((x) => `seed ${x.seed}: ${x.detail}`);
        expect(r.pass, `${gate.id} on ${r.site}: ${misses.join('; ')}`).toBe(true);
      }
    });
  }

  it('the bots are deterministic: the same seed plays the same game', () => {
    const a = playBot(greedyBot(), { start: 'greenfield', site: 'front-range', seed: 7, days: 60 });
    const b = playBot(greedyBot(), { start: 'greenfield', site: 'front-range', seed: 7, days: 60 });
    expect(a.actions).toEqual(b.actions);
    expect(a.state.cash).toBe(b.state.cash);
  });

  it('the greedy bot builds something for the worst row each week', () => {
    const r = playBot(greedyBot(), { start: 'greenfield', site: 'asheville-nc', seed: 1, days: 60 });
    expect(r.actions.filter((x) => x.kind === 'place').length).toBeGreaterThan(0);
  });
});
