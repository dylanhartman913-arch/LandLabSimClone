import { writeFileSync } from 'node:fs';
import { coverageReport, runCoverage } from '../../bots/coverage.ts';

/** Run the LL-49 alert coverage and render it; optionally write the Markdown report. */
export function runCoverageCommand(o: { md?: string } = {}): { text: string; pass: boolean } {
  const r = coverageReport(runCoverage());
  if (o.md) writeFileSync(o.md, r.text + '\n');
  return r;
}
