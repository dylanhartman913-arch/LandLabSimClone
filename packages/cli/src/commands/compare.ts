import { writeFileSync } from 'node:fs';
import { runComparisons, winterRescue, COMPARE_SEEDS, COMPARE_SITES, type RunMetrics, type VariantRun } from '../../bots/compare.ts';

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
/** Median, with the range when runs disagree. */
const spread = (runs: VariantRun[], f: (m: RunMetrics) => number, show: (n: number) => string = (n) => n.toFixed(0)) => {
  const xs = runs.map((r) => f(r.metrics));
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return lo === hi ? show(lo) : `${show(median(xs))} (${show(lo)}–${show(hi)})`;
};
const heaterDay = (m: RunMetrics) => m.built.find((b) => b.system === 'Rocket Mass Heater')?.day ?? Infinity;

/** Run the LL-10 comparisons and render a Markdown report; optionally write it and raw JSON. */
export function runCompare(o: { md?: string; json?: string; days?: number } = {}): string {
  const results = runComparisons({ days: o.days });
  const lines = [
    '# Controlled first-year comparisons (LL-10)',
    '',
    `Start greenfield, two adults, ${o.days ?? 365} days. Each comparison changes one decision; every variant otherwise follows the tutorial route (each quest's own steps once, when it becomes current). Sites: ${COMPARE_SITES.join(', ')}. Standard = average climate, one run per site. Real = real weather, seeds ${COMPARE_SEEDS.join(', ')} per site. Cells show the median and (range) across runs. Rules: engine 0.9 new-game settings (employment below upkeep, $8,000/adult startup, site crew rates, no overdraft). See docs/PHASE_8.md for the before/after comparison.`,
    '',
    'Columns: short = days with any survival need below its shortage threshold while someone is home; min WB = lowest daily wellbeing (0 while in town); left = runs with any town departure / runs; away = days with someone in town; cash end / low; pantry = prepared Food days at the end; grown = home-grown share of food eaten over the year; jobs / build h = employment and construction hours over the run; wk1 jobs = employment hours / available hours in the first week, before any collapse; heater = day the Rocket Mass Heater was completed (— never); gifts = tutorial cash + market value of reward stock; missed = scheduled actions that failed.',
    '',
  ];
  for (const r of results) {
    lines.push(`## ${r.comparison.id}: ${r.comparison.question}`, '');
    lines.push('| Variant | Weather | short | min WB | left | away | cash end | cash low | pantry | grown | jobs h | wk1 jobs | build h | heater | gifts | missed |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const v of r.variants)
      for (const difficulty of ['standard', 'real'] as const) {
        const runs = v.runs.filter((x) => x.difficulty === difficulty);
        lines.push(
          `| ${v.variant.label} | ${difficulty === 'standard' ? 'Standard' : 'Real'} | ${spread(runs, (m) => m.essentialShortDays)} | ${spread(runs, (m) => m.minWellbeing)} | ${runs.filter((x) => x.metrics.departures > 0).length}/${runs.length} | ${spread(runs, (m) => m.daysAway)} | ${spread(runs, (m) => m.cashEnd, money)} | ${spread(runs, (m) => m.cashMin, money)} | ${spread(runs, (m) => m.pantryDays)} | ${spread(runs, (m) => m.homegrownYear, (n) => `${(n * 100).toFixed(1)}%`)} | ${spread(runs, (m) => m.labor.employment)} | ${spread(runs, (m) => m.firstWeek.employment)} / ${spread(runs, (m) => m.firstWeek.available)} | ${spread(runs, (m) => m.labor.construction)} | ${spread(runs, heaterDay, (n) => (Number.isFinite(n) ? n.toFixed(0) : '—'))} | ${spread(runs, (m) => m.subsidy, money)} | ${spread(runs, (m) => m.skippedActions)} |`,
        );
      }
    lines.push('');
  }
  lines.push('## Winter save rescue (recorded day-240 save, front range, zero resident labor, 90 days)', '');
  lines.push('| Action | Prepaid | Home on day | Left again | Home at day 90 | Cash at day 90 | Lowest cash |', '|---|---|---|---|---|---|---|');
  for (const w of winterRescue(90))
    lines.push(`| ${w.label} | ${money(w.prepaid)} | ${w.homeDay ?? '—'} | ${w.leftAgain ? 'yes' : 'no'} | ${w.homeAtEnd ? 'yes' : 'no'} | ${money(w.cashEnd)} | ${money(w.lowestCash)} |`);
  const text = lines.join('\n');
  if (o.md) writeFileSync(o.md, text + '\n');
  if (o.json) writeFileSync(o.json, JSON.stringify(results.map((r) => ({ id: r.comparison.id, question: r.comparison.question, variants: r.variants.map((v) => ({ id: v.variant.id, label: v.variant.label, runs: v.runs })) })), null, 1));
  return text;
}
