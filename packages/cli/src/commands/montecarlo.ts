import { writeFileSync } from 'node:fs';
import { catalog } from '@homestead/catalog';
import { monteCarlo, monteCarloTable, type MonteCarloSpec } from '@homestead/engine';
import { table } from '../table.ts';

/** Worst-week coverage per checklist row across seeds, and the odds of a hardship month. */
export function runMonteCarlo(spec: MonteCarloSpec, opts: { json?: string; quiet?: boolean } = {}): string {
  const total = spec.seeds;
  const r = monteCarlo(catalog, spec, (done) => {
    if (!opts.quiet && process.stderr.isTTY) process.stderr.write(`\r  seed ${done} of ${total}`);
  });
  if (!opts.quiet && process.stderr.isTTY) process.stderr.write('\n');
  if (opts.json) writeFileSync(opts.json, `${JSON.stringify(r, null, 2)}\n`);
  const t = monteCarloTable(r);
  return [
    `${spec.design.name} on ${spec.siteId}: ${spec.years} years × ${spec.seeds} seeds (${spec.baseSeed}…${spec.baseSeed + spec.seeds - 1}), ${r.weatherMode} weather`,
    'Worst-week coverage per need, across runs:',
    '',
    table(t.headers, t.rows),
    '',
    ...t.lines,
  ].join('\n');
}
