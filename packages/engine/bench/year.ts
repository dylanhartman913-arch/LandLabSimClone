// Benchmark: one simulated year of a ~200-instance design, run as plain Node
// (bundled by the performance test so no test-runner transform is in the loop).
import { readFileSync } from 'node:fs';
import { catalog, getSite } from '@homestead/catalog';
import { initGame, placeDesign, resolveDesign, stepDays } from '../src/index.ts';

const designPath = process.argv[2]!;
const file = JSON.parse(readFileSync(designPath, 'utf8')) as { counts: Record<string, number> };
const design = resolveDesign(catalog, file.counts);
const total = Object.values(design.counts).reduce((a, b) => a + b, 0);
const counts = Object.fromEntries(
  Object.entries(design.counts).map(([k, v]) => [k, Math.max(1, Math.round((v * 200) / total))]),
);
const g = placeDesign(catalog, initGame(catalog, getSite('front-range'), { parcelAcres: 20 }, 1), counts);
stepDays(g, catalog, 365); // warm up the JIT
let best = Infinity;
for (let k = 0; k < 3; k++) {
  const t0 = performance.now();
  stepDays(g, catalog, 365);
  best = Math.min(best, performance.now() - t0);
}
console.log(JSON.stringify({ instances: g.instances.length, bestMs: best }));
