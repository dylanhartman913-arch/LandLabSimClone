import { describe, expect, it } from 'vitest';
import { catalog } from '@homestead/catalog';
import { gameDigest } from '@homestead/engine';
import { COMPARISONS, NEW_GAME_SETTINGS, firstColdDay, measure, runComparisons, winterRescue } from '../bots/compare.ts';
import { playBot, tutorialFollowerBot } from '../bots/index.ts';

const variant = (c: string, v: string) => COMPARISONS.find((x) => x.id === c)!.variants.find((x) => x.id === v)!;

describe('controlled first-year comparisons (LL-10)', () => {
  it('the comparison baseline plays exactly the tutorial follower’s game', () => {
    const o = { start: 'greenfield', site: 'laramie-wy', difficulty: 'real' as const, seed: 2, days: 200, settings: NEW_GAME_SETTINGS };
    const a = playBot(tutorialFollowerBot(), o);
    const b = playBot(variant('tutorial', 'on').bot(null), o);
    expect(b.actions).toEqual(a.actions);
    expect(gameDigest(b.state)).toBe(gameDigest(a.state));
  });

  it('tutorial off repeats the same actions on the same days, minus the gifts', () => {
    const o = { start: 'greenfield', site: 'front-range', days: 120, settings: NEW_GAME_SETTINGS };
    const on = playBot(variant('tutorial', 'on').bot(null), o);
    const off = playBot(variant('tutorial', 'off').bot(on), o);
    const days = (r: typeof on) => r.actions.filter((a) => a.kind === 'place').map((a) => a.at);
    expect(days(off)).toEqual(days(on).slice(0, days(off).length));
    expect(measure(on, catalog).subsidy).toBeGreaterThan(0);
    expect(measure(off, catalog).subsidy).toBe(0);
  });

  it('early and late winter preparation differ only in the day the heater is started', () => {
    const o = { start: 'greenfield', site: 'front-range', days: 365, settings: NEW_GAME_SETTINGS };
    const early = playBot(variant('winter', 'early').bot(null), o);
    const late = playBot(variant('winter', 'late').bot(null), o);
    const heater = catalog.systems.find((s) => s.name === 'Rocket Mass Heater')!.id;
    const placed = (r: typeof early) => r.actions.find((a) => a.kind === 'place' && a.systemId === heater)!.at - r.ledgers[0]!.absDay;
    expect(placed(late) - placed(early)).toBe(53);
    expect(placed(late)).toBe(firstColdDay(playBot(variant('winter', 'late').bot(null), { ...o, days: 0 }).state) - 7);
  });

  it('a comparison reports every site and weather cell with deterministic metrics', () => {
    const run = () => runComparisons({ comparisons: [COMPARISONS.find((c) => c.id === 'stacking')!], sites: ['asheville-nc'], seeds: [1], days: 60 });
    const [a] = run();
    expect(a!.variants.map((v) => v.runs.length)).toEqual([2, 2]);
    expect(run()[0]!.variants[1]!.runs[1]!.metrics).toEqual(a!.variants[1]!.runs[1]!.metrics);
  });

  it('the winter save rescue: nothing stalls, the recovery route brings people home and keeps them there', () => {
    const [idle, , route] = winterRescue(60);
    expect(idle!.homeAtEnd).toBe(false);
    expect(route!.homeDay).not.toBeNull();
    expect(route!.homeAtEnd).toBe(true);
    expect(route!.prepaid).toBeCloseTo(2347.05, 2);
  });
});
