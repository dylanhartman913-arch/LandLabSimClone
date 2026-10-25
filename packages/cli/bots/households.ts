import { catalog as defaultCatalog, getStart, STARTS, type Catalog } from '@homestead/catalog';
import { HEAT_HDD_MIN } from '@homestead/engine';
import { GATE_SITES } from './gates.ts';
import { idleBot } from './idle.ts';
import { NEW_GAME_SETTINGS, playBot } from './run.ts';

/**
 * Household scaling (LL-51 follow-up): does a bigger household start as well covered as the start's
 * default one? Measured on day 3 (after the warm-up) for the survival rows, and by when an idle
 * household first goes to town. Measurement only.
 */

export const HOUSEHOLDS: [adults: number, children: number][] = [
  [1, 0],
  [2, 0],
  [2, 2],
  [3, 0],
  [4, 0],
  [4, 3],
];

/** Survival rows a kit covers, with the needs-row name. Heat counts only on a cold day. */
export const KIT_ROWS = ['Drinking water', 'Shelter', 'Heated shelter', 'Sanitation'] as const;

export interface HouseholdRun {
  start: string;
  site: string;
  adults: number;
  children: number;
  /** Share met on day 3, per row (null when the row asks for nothing that day). */
  coverage: Record<(typeof KIT_ROWS)[number], number | null>;
  /** Idle household's first day in town (null: home all year). */
  leftOn: number | null;
}

/** `fixed`: the kit before household scaling (no extra blocks), for comparison. */
export function measureHousehold(start: string, site: string, adults: number, children: number, o: { days?: number; fixed?: boolean; catalog?: Catalog } = {}): HouseholdRun {
  const def = getStart(start);
  const kit = o.fixed ? { ...def, household: { ...def.household, extra: [] } } : def;
  const r = playBot(idleBot(), { start: kit, site, days: o.days ?? 365, household: adults, children, catalog: o.catalog ?? defaultCatalog, settings: NEW_GAME_SETTINGS });
  const l = r.ledgers[2]!;
  const coverage = {} as HouseholdRun['coverage'];
  for (const row of KIT_ROWS) {
    const n = l.needs[row];
    coverage[row] = n.needed <= 1e-9 || (row === 'Heated shelter' && l.weather.hdd <= HEAT_HDD_MIN) ? null : n.delivered / n.needed;
  }
  const left = r.events.find((e) => e.kind === 'went-to-town');
  return { start, site, adults, children, coverage, leftOn: left ? left.absDay - r.ledgers[0]!.absDay : null };
}

/** Every start, site and household its start screen allows. */
export function measureHouseholds(o: { starts?: string[]; sites?: string[]; days?: number; fixed?: boolean } = {}): HouseholdRun[] {
  const out: HouseholdRun[] = [];
  for (const start of o.starts ?? Object.keys(STARTS)) {
    const h = getStart(start).household;
    for (const site of o.sites ?? GATE_SITES)
      for (const [adults, children] of HOUSEHOLDS)
        if (adults >= h.min && adults <= h.max && children <= h.maxChildren) out.push(measureHousehold(start, site, adults, children, o));
  }
  return out;
}

/**
 * A bigger household passes when no kit row starts more than `slack` below the default household's
 * coverage on the same site, and it stays home at least as long, less `days`. The days allow for wild
 * food: the land's greens and berries don't grow with the household, so a big idle one eats through
 * its (scaled) stockpile a little sooner.
 */
export function compareToDefault(runs: HouseholdRun[], slack = 0.05, days = 21) {
  return runs.map((run) => {
    const base = runs.find((x) => x.start === run.start && x.site === run.site && x.adults === getStart(run.start).household.default && x.children === 0)!;
    const short = KIT_ROWS.filter((row) => {
      const a = run.coverage[row];
      const b = base.coverage[row];
      return a !== null && b !== null && a < Math.min(1, b) - slack;
    });
    const home = (x: HouseholdRun) => x.leftOn ?? Infinity;
    const early = home(run) < home(base) - days;
    return { run, base, short, early, pass: !short.length && !early };
  });
}

/** Markdown: per start and household, sites that pass and idle departures, with the kit before scaling beside it. */
export function householdReport(o: { sites?: string[] } = {}): { text: string; pass: boolean } {
  const after = compareToDefault(measureHouseholds({ sites: o.sites }));
  const before = compareToDefault(measureHouseholds({ sites: o.sites, fixed: true }));
  const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
  const days = (xs: (number | null)[]) => {
    const n = xs.map((x) => x ?? Infinity);
    const lo = Math.min(...n);
    const hi = Math.max(...n);
    const f = (d: number) => (Number.isFinite(d) ? `day ${d + 1}` : 'home');
    return lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`;
  };
  const worst = (cs: typeof after) => {
    let w: { row: string; v: number } | null = null;
    for (const c of cs) for (const row of KIT_ROWS) {
      const v = c.run.coverage[row];
      if (v !== null && (!w || v < w.v)) w = { row, v };
    }
    return w ? `${w.row} ${pct(w.v)}` : '—';
  };
  const lines = [
    '# Household scaling',
    '',
    'Reproduce with `npm run sim -- households --md docs/HOUSEHOLDS.md`. Every start, every site, each household the start screen allows, Standard weather, idle for a year with the rules a new game sets. A household passes on a site when no kit row (drinking water, shelter, heat on a cold day, sanitation) starts more than 5 points below the start\'s default household on day 3, and the idle household stays home within 21 days of the default one. **Fixed kit** is the kit before scaling.',
    '',
    '| Start | Household | Sites passing (fixed → scaled) | Idle household leaves (fixed → scaled) | Lowest kit row on day 3 (fixed → scaled) |',
    '|---|---|---|---|---|',
  ];
  for (const start of [...new Set(after.map((c) => c.run.start))])
    for (const [adults, children] of HOUSEHOLDS) {
      const a = after.filter((c) => c.run.start === start && c.run.adults === adults && c.run.children === children);
      const b = before.filter((c) => c.run.start === start && c.run.adults === adults && c.run.children === children);
      if (!a.length) continue;
      lines.push(`| ${start} | ${adults} adult${adults === 1 ? '' : 's'}${children ? ` + ${children} children` : ''} | ${b.filter((c) => c.pass).length}/${b.length} → ${a.filter((c) => c.pass).length}/${a.length} | ${days(b.map((c) => c.run.leftOn))} → ${days(a.map((c) => c.run.leftOn))} | ${worst(b)} → ${worst(a)} |`);
    }
  const misses = after.filter((c) => !c.pass);
  if (misses.length) lines.push('', `**Misses:** ${misses.map((c) => `${c.run.start} ${c.run.adults}+${c.run.children} on ${c.run.site} (${[...c.short, ...(c.early ? ['leaves early'] : [])].join(', ')})`).join('; ')}.`);
  return { text: lines.join('\n'), pass: !misses.length };
}
