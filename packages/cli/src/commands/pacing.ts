import { runGates } from '../../bots/index.ts';

/** Run every pacing gate (3 seeds × 3 sites) and print a table; false if any gate misses. */
export function runPacing(): { text: string; pass: boolean } {
  const results = runGates();
  const lines = ['Pacing gates (playability roadmap, G16): 3 seeds × 3 sites', ''];
  for (const r of results) {
    lines.push(`${r.pass ? 'PASS' : 'FAIL'}  ${r.gate.id.padEnd(26)} ${r.site.padEnd(14)} ${r.gate.bot} — ${r.gate.rule}`);
    for (const run of r.runs) lines.push(`        seed ${run.seed}: ${run.pass ? 'ok  ' : 'miss'} ${run.detail}`);
  }
  const pass = results.every((r) => r.pass);
  lines.push('', pass ? 'All pacing gates pass.' : `${results.filter((r) => !r.pass).length} gate(s) missed.`);
  return { text: lines.join('\n'), pass };
}
