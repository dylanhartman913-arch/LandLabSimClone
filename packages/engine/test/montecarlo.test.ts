import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  aggregateMonteCarlo,
  monteCarlo,
  monteCarloRun,
  monteCarloTable,
  quantile,
  type DesignFile,
  type MonteCarloResult,
  type MonteCarloSpec,
} from '../src/index.ts';
import { catalog } from './time-helpers.ts';

const root = resolve(__dirname, '../../..');
const rainFed = JSON.parse(readFileSync(join(root, 'designs/rain-fed-yurt.json'), 'utf8')) as DesignFile;
const spec: MonteCarloSpec = { design: rainFed, siteId: 'laramie-wy', years: 2, seeds: 8, baseSeed: 1 };

describe('Monte Carlo', () => {
  const real = monteCarlo(catalog, spec);

  it('the same seeds give the same numbers, run by run', () => {
    expect(monteCarlo(catalog, spec).digest).toBe(real.digest);
    // Seeds are independent: running seed k alone matches its place in the batch.
    expect(monteCarloRun(catalog, spec, 5)).toEqual(real.runs[5]);
    expect(aggregateMonteCarlo(spec, real.runs).digest).toBe(real.digest);
  });

  it('a rain-fed design’s water varies from year to year in real weather, and not at all in average weather', () => {
    const water = real.rows.find((r) => r.need === 'Water')!;
    expect(water.p90 - water.p10).toBeGreaterThan(0.005);
    const avg = monteCarlo(catalog, { ...spec, weatherMode: 'average' });
    const w2 = avg.rows.find((r) => r.need === 'Water')!;
    expect(w2.p90 - w2.p10).toBe(0);
    expect(new Set(real.runs.flatMap((r) => r.precipMults)).size).toBe(16);
  });

  it('reports the chance of a hardship month and a histogram per row', () => {
    expect(real.pAnyHardshipMonth).toBeGreaterThanOrEqual(0);
    expect(real.pAnyHardshipMonth).toBeLessThanOrEqual(1);
    for (const r of real.rows) {
      expect(r.histogram.reduce((a, b) => a + b, 0)).toBe(r.n);
      expect(r.min).toBeLessThanOrEqual(r.p10);
      expect(r.p10).toBeLessThanOrEqual(r.p50);
      expect(r.p50).toBeLessThanOrEqual(r.p90);
    }
  });

  it('quantiles interpolate between neighbours', () => {
    expect(quantile([0, 10], 0.5)).toBe(5);
    expect(quantile([1, 2, 3, 4, 5], 0.1)).toBeCloseTo(1.4, 12);
  });

  it('the CLI prints the same table and digest as the engine for the same seeds', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mc-'));
    const out = join(dir, 'mc.json');
    const text = execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        join(root, 'packages/cli/src/main.ts'),
        'montecarlo',
        join(root, 'designs/rain-fed-yurt.json'),
        '--years',
        '2',
        '--seeds',
        '8',
        '--json',
        out,
      ],
      { cwd: root, encoding: 'utf8' },
    );
    const cli = JSON.parse(readFileSync(out, 'utf8')) as MonteCarloResult;
    expect(cli.digest).toBe(real.digest);
    expect(cli).toEqual(JSON.parse(JSON.stringify(real)));
    const lines = text.split('\n');
    for (const row of monteCarloTable(real).rows) {
      const line = lines.find((l) => l.startsWith(`${row[0]} `))!;
      expect(line.trim().split(/\s{2,}/)).toEqual(row);
    }
    expect(text).toContain(`Digest: ${real.digest}`);
  }, 60_000);
});
