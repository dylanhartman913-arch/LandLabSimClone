import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ENGINE_VERSION } from '@homestead/engine';
import { runComparisons, winterRescue, COMPARE_SEEDS, COMPARE_SITES, NEW_GAME_SETTINGS, type ComparisonResult, type RunMetrics, type VariantRun } from '../../bots/compare.ts';
import { EXPERIMENTAL_MECHANICS } from '../../bots/run.ts';

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
export function runCompare(o: { md?: string; json?: string; days?: number; profile?: Profile } = {}): string {
  const profile = o.profile ?? PROFILES[0]!;
  const results = runComparisons({ days: o.days, settings: profile.settings });
  const text = renderCompare(results, profile, o.days);
  if (o.md) writeFileSync(o.md, text + '\n');
  if (o.json) writeFileSync(o.json, JSON.stringify(results.map((r) => ({ id: r.comparison.id, question: r.comparison.question, variants: r.variants.map((v) => ({ id: v.variant.id, label: v.variant.label, runs: v.runs })) })), null, 1));
  return text;
}

function renderCompare(results: ComparisonResult[], profile: Profile, days?: number): string {
  const o = { days };
  const lines = [
    `# Controlled first-year comparisons (LL-10)${profile.id === 'new-game' ? '' : `: ${profile.label}`}`,
    '',
    ...(profile.id === 'new-game' ? [] : [`${profile.note} Regenerate with \`npm run test:comparisons -- --update\` (LL-50).`, '']),
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
  return lines.join('\n');
}

/** A rule set the LL-10 suite runs under (LL-50). */
export interface Profile {
  id: string;
  label: string;
  note: string;
  settings: Record<string, unknown>;
  md: string;
}

export const PROFILES: Profile[] = [
  { id: 'new-game', label: 'New-game rules', note: 'The rules a new game sets.', settings: NEW_GAME_SETTINGS, md: 'docs/PHASE_4_COMPARISONS.md' },
  {
    id: 'experimental',
    label: 'every experimental mechanic on',
    note: `New-game rules plus every opt-in mechanic under Settings → Experimental mechanics (${EXPERIMENTAL_MECHANICS.join(', ')}), so a change to a gated mechanic shows up here even though a new game leaves it off.`,
    settings: { ...NEW_GAME_SETTINGS, ...Object.fromEntries(EXPERIMENTAL_MECHANICS.map((k) => [k, true])) },
    md: 'docs/PHASE_4_COMPARISONS_EXPERIMENTAL.md',
  },
];

export const HEADLINES_PATH = 'docs/comparisons/headlines.json';
export const NOTES_PATH = 'docs/COMPARISON_NOTES.md';

/**
 * The outcomes a player would notice, per profile, comparison, variant and weather: departures,
 * survival-short days, lowest wellbeing, end cash (nearest $100) and home-grown share (nearest %).
 * Medians across runs, as the report shows.
 */
export function headlines(results: ComparisonResult[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of results)
    for (const v of r.variants)
      for (const difficulty of ['standard', 'real'] as const) {
        const runs = v.runs.filter((x) => x.difficulty === difficulty);
        if (!runs.length) continue;
        const med = (f: (m: RunMetrics) => number) => median(runs.map((x) => f(x.metrics)));
        out[`${r.comparison.id}/${v.variant.id}/${difficulty}`] = [
          `left ${runs.filter((x) => x.metrics.departures > 0).length}/${runs.length}`,
          `short ${med((m) => m.essentialShortDays).toFixed(0)}`,
          `min WB ${med((m) => m.minWellbeing).toFixed(0)}`,
          `cash end ${money(Math.round(med((m) => m.cashEnd) / 100) * 100)}`,
          `grown ${(med((m) => m.homegrownYear) * 100).toFixed(0)}%`,
        ].join(', ');
      }
  return out;
}

export const headlineDigest = (h: Record<string, Record<string, string>>) =>
  createHash('sha256').update(JSON.stringify(h)).digest('hex').slice(0, 12);

/** The note for a digest: its section of COMPARISON_NOTES.md, or null. */
export function noteFor(notes: string, digest: string): string | null {
  const parts = notes.split(/^## /m);
  const hit = parts.find((p) => p.split('\n')[0]!.includes(digest));
  return hit ?? null;
}

function diffHeadlines(before: Record<string, Record<string, string>>, after: Record<string, Record<string, string>>): string[] {
  const out: string[] = [];
  for (const profile of new Set([...Object.keys(before), ...Object.keys(after)]))
    for (const key of new Set([...Object.keys(before[profile] ?? {}), ...Object.keys(after[profile] ?? {})])) {
      const a = before[profile]?.[key];
      const b = after[profile]?.[key];
      if (a !== b) out.push(`${profile} ${key}: ${a ?? '(none)'} → ${b ?? '(none)'}`);
    }
  return out;
}

/**
 * LL-50: run the suite under every profile and hold it to what is committed. Fails when a report is
 * stale, when a headline moved without the headlines being regenerated, or when the committed
 * headlines have no finished note in COMPARISON_NOTES.md. `update` regenerates the reports and
 * headlines and opens a note stub for the new digest that must be filled in before the check passes.
 */
export function compareCi(o: { update?: boolean; days?: number } = {}): { text: string; pass: boolean } {
  const lines: string[] = [];
  const fresh: Record<string, Record<string, string>> = {};
  const stale: string[] = [];
  for (const profile of PROFILES) {
    const results = runComparisons({ days: o.days, settings: profile.settings });
    const text = renderCompare(results, profile, o.days) + '\n';
    fresh[profile.id] = headlines(results);
    if (o.update) writeFileSync(profile.md, text);
    else if (!existsSync(profile.md) || readFileSync(profile.md, 'utf8') !== text) stale.push(profile.md);
  }
  const committed: Record<string, Record<string, string>> = existsSync(HEADLINES_PATH) ? JSON.parse(readFileSync(HEADLINES_PATH, 'utf8')).headlines : {};
  const changed = diffHeadlines(committed, fresh);
  const digest = headlineDigest(fresh);
  let notes = existsSync(NOTES_PATH) ? readFileSync(NOTES_PATH, 'utf8') : '# Comparison notes (LL-50)\n';
  if (o.update) {
    writeFileSync(HEADLINES_PATH, JSON.stringify({ digest, engine: ENGINE_VERSION, headlines: fresh }, null, 1) + '\n');
    if (!noteFor(notes, digest)) {
      notes = notes.replace(/\s*$/, '\n') + `\n## ${digest} — engine ${ENGINE_VERSION}\n\nWhy: TODO (what changed and why the new outcomes are right)\n\n${changed.length ? changed.map((c) => `- ${c}`).join('\n') : '- No headline changed.'}\n`;
      writeFileSync(NOTES_PATH, notes);
    }
    lines.push(`Updated ${PROFILES.map((p) => p.md).join(', ')} and ${HEADLINES_PATH} (digest ${digest}).`);
    lines.push(changed.length ? `${changed.length} headline(s) changed:\n${changed.map((c) => `  ${c}`).join('\n')}` : 'No headline changed.');
  }
  const note = noteFor(notes, digest);
  const failures = [
    ...(o.update ? [] : stale.map((f) => `${f} is out of date: run \`npm run test:comparisons -- --update\` and commit it.`)),
    ...(!o.update && changed.length ? [`${changed.length} headline outcome(s) changed without regenerating ${HEADLINES_PATH} and a note:\n${changed.map((c) => `  ${c}`).join('\n')}\nRun \`npm run test:comparisons -- --update\`, then explain the change under ## ${digest} in ${NOTES_PATH}.`] : []),
    ...(!note ? [`${NOTES_PATH} has no note for headline digest ${digest}.`] : /TODO/.test(note) ? [`The note for ${digest} in ${NOTES_PATH} still says TODO: explain the change.`] : []),
  ];
  lines.push(...failures, failures.length ? `${failures.length} comparison check(s) failed.` : `Comparisons match the committed reports; headline digest ${digest} has a note.`);
  return { text: lines.join('\n'), pass: failures.length === 0 };
}
