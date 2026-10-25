import { describe, expect, it } from 'vitest';
import { catalog } from '@homestead/catalog';
import { gameDigest } from '@homestead/engine';
import { readFileSync } from 'node:fs';
import { COMPARISONS, NEW_GAME_SETTINGS, firstColdDay, measure, runComparisons, winterRescue, type RunMetrics } from '../bots/compare.ts';
import { EXPERIMENTAL_MECHANICS } from '../bots/run.ts';
import { HEADLINES_PATH, NOTES_PATH, PROFILES, headlineDigest, headlines, noteFor } from '../src/commands/compare.ts';
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
    expect(route!.prepaid).toBeCloseTo(1207.06, 2); // LL-25: 18/h site crew rate, same supplies and hours;
  });
});

describe('Phase 8 first-year acceptance', () => {
  it('remote work, no-gift supplies and replacing the tent with a yurt survive Standard on every site', () => {
    const results = runComparisons({ comparisons: COMPARISONS.filter((c) => ['job', 'tutorial', 'shelter', 'rescue'].includes(c.id)), seeds: [] });
    for (const [id, v] of [['job', 'remote'], ['tutorial', 'off'], ['shelter', 'yurt-replace'], ['rescue', 'crew']]) {
      const runs = results.find((c) => c.comparison.id === id)!.variants.find((x) => x.variant.id === v)!.runs;
      expect(runs).toHaveLength(3);
      for (const r of runs) {
        expect(r.metrics.departures, `${id}/${v}/${r.site}`).toBe(0);
        expect(r.metrics.cashMin).toBeGreaterThanOrEqual(0);
        expect(r.metrics.skippedActions).toBe(0);
        if (id !== 'rescue') expect(r.metrics.minWellbeing).toBeGreaterThanOrEqual(60);
        if (id === 'tutorial') expect(r.metrics.subsidy).toBe(0);
      }
    }
  });
});

describe('LL-50: strategy comparisons in CI', () => {
  it('the committed headlines have a finished note, and their digest matches their content', () => {
    const file = JSON.parse(readFileSync(HEADLINES_PATH, 'utf8'));
    expect(headlineDigest(file.headlines)).toBe(file.digest);
    expect(Object.keys(file.headlines)).toEqual(PROFILES.map((p) => p.id));
    const note = noteFor(readFileSync(NOTES_PATH, 'utf8'), file.digest);
    expect(note).not.toBeNull();
    expect(note).not.toMatch(/TODO/);
  });

  it('a headline is what a player would notice: a moved cash total changes it, a gift price does not', () => {
    const [r] = runComparisons({ comparisons: [COMPARISONS.find((c) => c.id === 'stacking')!], sites: ['asheville-nc'], seeds: [], days: 30 });
    const h = headlines([r!]);
    expect(Object.keys(h)).toEqual(['stacking/one/standard', 'stacking/three/standard']);
    const bump = (dx: Partial<RunMetrics>) => headlines([{ ...r!, variants: r!.variants.map((v) => ({ ...v, runs: v.runs.map((x) => ({ ...x, metrics: { ...x.metrics, ...dx } })) })) }]);
    expect(bump({ subsidy: 99 })).toEqual(h);
    expect(bump({ cashEnd: r!.variants[0]!.runs[0]!.metrics.cashEnd + 500 })['stacking/one/standard']).not.toBe(h['stacking/one/standard']);
    expect(bump({ departures: 1 })['stacking/one/standard']).toMatch(/^left 1\/1/);
  });

  it('a note is found by the digest in its heading, not by a mention in another note', () => {
    const notes = '# Notes\n\n## abc123 — engine 1\n\nWhy: x\n\n## def456 — engine 2\n\nWhy: TODO, see abc999\n';
    expect(noteFor(notes, 'abc123')).toMatch(/Why: x/);
    expect(noteFor(notes, 'def456')).toMatch(/TODO/);
    expect(noteFor(notes, 'abc999')).toBeNull();
  });

  it('the experimental profile turns on every mechanic a new game leaves off', () => {
    const exp = PROFILES.find((p) => p.id === 'experimental')!;
    for (const k of EXPERIMENTAL_MECHANICS) {
      expect(exp.settings[k]).toBe(true);
      expect((NEW_GAME_SETTINGS as Record<string, unknown>)[k]).toBeUndefined();
    }
  });
});
