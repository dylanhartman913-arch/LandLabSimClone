import { describe, expect, it } from 'vitest';
import { getStart } from '@homestead/catalog';
import { GATES, playBot, greedyBot, runGates } from '../bots/index.ts';
import { idleBot } from '../bots/idle.ts';
import { NEW_GAME_SETTINGS } from '../bots/run.ts';

describe('pacing gates (G16): the playtest bots on 6 sites × 3 seeds', () => {
  for (const gate of GATES) {
    it(`${gate.id}: ${gate.bot} — ${gate.rule}`, () => {
      for (const r of runGates({ gates: [gate] })) {
        const misses = r.runs.filter((x) => !x.pass).map((x) => `seed ${x.seed}: ${x.detail}`);
        expect(r.pass, `${gate.id} on ${r.site}: ${misses.join('; ')}`).toBe(true);
      }
    }, 180_000);
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

  it('LL-51: the farm gate has teeth: without the job, the mortgage falls behind and the gate fails', () => {
    const farm = getStart('farm');
    const jobless = { ...farm, instances: farm.instances.filter((i) => i.system !== 'Average Job') };
    const gate = GATES.find((g) => g.id === 'farm-idle')!;
    const r = playBot(idleBot(), { start: jobless, site: 'olympia-wa', days: 365, settings: NEW_GAME_SETTINGS });
    const v = gate.check(r, 'olympia-wa', undefined as never, idleBot());
    expect(v.pass).toBe(false);
    expect(v.detail).toMatch(/most behind on the mortgage \$[1-9]/);
  });
});
