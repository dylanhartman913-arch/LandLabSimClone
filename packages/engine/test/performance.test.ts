import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSync } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { catalog } from '@homestead/catalog';
import { balancePotential } from '../src/index.ts';
import { loadDesign, REPO } from './fixtures.ts';

// Its own Vitest project (vitest.config.ts) so the year-long bot simulations elsewhere don't share the CPU.
describe('performance (runs after every other test file, alone)', () => {
  it('runs 1,000 balancePotential calls on a 200-instance design in under 200 ms', () => {
    const { design } = loadDesign('offgrid-cabin-family.json');
    // Scale the cabin design up to 200 instances.
    const total = Object.values(design.counts).reduce((a, b) => a + b, 0);
    const scale = 200 / total;
    const counts = Object.fromEntries(
      Object.entries(design.counts).map(([k, v]) => [k, Math.max(1, Math.round(v * scale))]),
    );
    const big = { counts };
    for (let i = 0; i < 200; i++) balancePotential(catalog, catalog.assumptions, big); // warm up the JIT
    // Best of three batches: other test files run in parallel and add noise.
    let ms = Infinity;
    for (let batch = 0; batch < 3; batch++) {
      const t0 = performance.now();
      for (let i = 0; i < 1000; i++) balancePotential(catalog, catalog.assumptions, big);
      ms = Math.min(ms, performance.now() - t0);
    }
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(190);
    console.log(`1000 balancePotential calls: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(200);
  });

  it('simulates one year of a 200-instance design in under 150 ms in Node', () => {
    // Bundle the engine and run it in a child Node process, so the measurement is
    // plain Node rather than code rewritten by the test runner's module transform.
    const dir = mkdtempSync(join(tmpdir(), 'homestead-bench-'));
    const out = join(dir, 'year.mjs');
    buildSync({
      entryPoints: [join(REPO, 'packages/engine/bench/year.ts')],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile: out,
      logLevel: 'silent',
    });
    const res = spawnSync(process.execPath, [out, join(REPO, 'designs/offgrid-cabin-family.json')], {
      encoding: 'utf8',
    });
    rmSync(dir, { recursive: true, force: true });
    expect(res.status, res.stderr).toBe(0);
    const { instances, bestMs } = JSON.parse(res.stdout) as { instances: number; bestMs: number };
    console.log(`one year, ${instances} instances: ${bestMs.toFixed(1)} ms (best of 3, plain Node)`);
    expect(instances).toBeGreaterThanOrEqual(190);
    expect(bestMs).toBeLessThan(150);
  });
});
