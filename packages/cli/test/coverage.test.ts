import { describe, expect, it } from 'vitest';
import { getStart } from '@homestead/catalog';
import { ALERT_LEAD_DAYS, CLIFFS, EXPECTED_SITES, checkCliffs, coverageReport, playCoverage, runCoverage, type CoverageResult, type CoverageRun, type Scenario } from '../bots/coverage.ts';
import { GATE_SITES } from '../bots/gates.ts';
import { NEW_GAME_SETTINGS } from '../bots/run.ts';

describe('LL-49: every survival cliff is warned a week ahead in the novice bot\'s runs', () => {
  // One test per site (a long synchronous test starves the worker's progress reports), then the whole picture.
  const results: CoverageResult[] = [];
  for (const site of GATE_SITES)
    it(`${site}: every cliff reached is listed in time`, () => {
      const here = runCoverage({ sites: [site] });
      results.push(...here);
      const late = here.flatMap((r) => r.checks.filter((c) => !c.pass).map((c) => `${r.scenario.id}/${r.seed}: ${c.cliff.id} on day ${c.day! + 1}, warned ${c.lead} days`));
      expect(late).toEqual([]);
    }, 60_000);

  it('on every site, food, safe water, Carbon, feed, fuel and cash are listed in time, and each cliff is reached', () => {
    expect(new Set(results.map((r) => r.site)).size).toBe(GATE_SITES.length);
    const late = results.flatMap((r) => r.checks.filter((c) => !c.pass).map((c) => `${r.scenario.id}/${r.site}/${r.seed}: ${c.cliff.id} on day ${c.day! + 1}, warned ${c.lead} days`));
    expect(late).toEqual([]);
    for (const [cliff, sites] of Object.entries(EXPECTED_SITES))
      for (const site of sites) expect(results.some((r) => r.site === site && r.checks.some((c) => c.cliff.id === cliff && c.day !== null)), `${cliff} on ${site}`).toBe(true);
    // The novice who acts on Act now never reaches a cliff.
    expect(results.filter((r) => r.scenario.id === 'novice').every((r) => r.checks.every((c) => c.day === null))).toBe(true);
    expect(coverageReport(results).pass).toBe(true);
  });

  it('the check has teeth: a warning that shows up only on the cliff day fails', () => {
    const scenario: Scenario = { id: 'x', label: 'x', react: false, settings: NEW_GAME_SETTINGS, start: { ...getStart('greenfield'), autoGather: { ...getStart('greenfield').autoGather!, waterDays: 0 } }, seeds: [1] };
    const run = playCoverage(scenario, 'front-range', 1, 40);
    const water = checkCliffs(run).find((c) => c.cliff.id === 'water')!;
    expect(water.day).not.toBeNull();
    expect(water.lead).toBeGreaterThanOrEqual(ALERT_LEAD_DAYS);
    // Hide the runway alert: only the shortage itself is left, on the day it bites.
    const hidden: CoverageRun = { ...run, shown: run.shown.filter((a) => a.id !== 'water-runway') };
    const late = checkCliffs(hidden).find((c) => c.cliff.id === 'water')!;
    expect(late.pass).toBe(false);
    expect(late.lead).toBeLessThan(ALERT_LEAD_DAYS);
  });

  it('a warning listed only under Comfort or in the forecast does not count', () => {
    const scenario: Scenario = { id: 'x', label: 'x', react: false, settings: NEW_GAME_SETTINGS, start: { ...getStart('greenfield'), autoGather: { ...getStart('greenfield').autoGather!, waterDays: 0 } }, seeds: [1] };
    const run = playCoverage(scenario, 'asheville-nc', 1, 40);
    const moved: CoverageRun = { ...run, shown: run.shown.map((a) => (CLIFFS[1]!.alerts.includes(a.id) ? { ...a, group: 'comfort' } : a)) };
    const water = checkCliffs(moved).find((c) => c.cliff.id === 'water')!;
    expect(water.lead).toBe(0);
    expect(water.forecastLead).toBeGreaterThan(0);
  });
});
