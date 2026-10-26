import { catalog as defaultCatalog, getStart, type Catalog, type Start } from '@homestead/catalog';
import { CONSUMABLE_WARN_DAYS, type GameState } from '@homestead/engine';
import { GATE_SEEDS, GATE_SITES } from './gates.ts';
import { noviceBot } from './novice.ts';
import { NEW_GAME_SETTINGS, playBot, type PlayResult } from './run.ts';
import type { Bot } from './types.ts';

/**
 * Alert coverage (LL-49): for each survival cliff, a visible, ranked alert must be on the Needs and
 * bottlenecks list for at least ALERT_LEAD_DAYS mornings in a row before the first wellbeing penalty,
 * in the novice bot's runs on every site. Measurement only: nothing here changes the alerts.
 */

/** A week: the Act now horizon (CONSUMABLE_WARN_DAYS) is the shortest warning a player gets. */
export const ALERT_LEAD_DAYS = 7;

export interface Cliff {
  id: string;
  label: string;
  /** Alert ids that warn of this cliff. The 90-day forecast is reported, but never counts. */
  alerts: string[];
  /** What the cliff day is: the first wellbeing penalty, or for supplies without one, the first shortfall. */
  measuredTo: string;
  /** Mornings of warning required. */
  lead: number;
  /** Sections the warning must be listed in. */
  groups: string[];
  /** Run day the cliff bites (null when it never does). */
  day(r: CoverageRun): number | null;
  /** Forecast alerts that name this cliff (a forecast naming no need is a cash or departure headline). */
  forecast: (resource: string | null) => boolean;
}

/** One run with what the household felt: the first penalty day per survival need. */
export interface CoverageRun extends PlayResult {
  penalties: Record<string, number>;
  shown: NonNullable<Bot['shown']>;
}

const firstShort = (r: PlayResult, resources: string[]): number | null => {
  const k = r.ledgers.findIndex((l) => resources.some((x) => (l.resources[x]?.unmet ?? 0) > 1e-9));
  return k < 0 ? null : k;
};
/** The first penalty for `need` on or after the supply's first shortfall: the cliff that supply causes. */
const penaltyAfter = (r: CoverageRun, need: string, resources: string[]): number | null => {
  const from = firstShort(r, resources);
  const p = r.penalties[need];
  return from === null || p === undefined || p < from ? null : p;
};
const SURVIVAL_GROUPS = ['now', 'soon'];

export const CLIFFS: Cliff[] = [
  {
    id: 'food',
    label: 'Food',
    alerts: ['food-runway', 'food'],
    measuredTo: 'first Food wellbeing penalty',
    lead: ALERT_LEAD_DAYS,
    groups: SURVIVAL_GROUPS,
    day: (r) => r.penalties.Food ?? null,
    forecast: (res) => res === 'Food',
  },
  {
    id: 'water',
    label: 'Safe water',
    alerts: ['water-runway', 'drinkingWater'],
    measuredTo: 'first Drinking water wellbeing penalty',
    lead: ALERT_LEAD_DAYS,
    groups: SURVIVAL_GROUPS,
    day: (r) => r.penalties['Drinking water'] ?? null,
    forecast: (res) => res === 'Drinking water',
  },
  {
    id: 'carbon',
    label: 'Carbon (sawdust)',
    alerts: ['Carbon', 'sanitation'],
    measuredTo: 'first Sanitation wellbeing penalty after Carbon runs short',
    lead: ALERT_LEAD_DAYS,
    groups: SURVIVAL_GROUPS,
    day: (r) => penaltyAfter(r, 'Sanitation', ['Carbon']),
    forecast: (res) => res === 'Sanitation',
  },
  {
    id: 'fuel',
    label: 'Fuel (firewood, propane)',
    alerts: ['Woody biomass', 'Propane', 'heat'],
    measuredTo: 'first Heat wellbeing penalty after firewood or propane runs short',
    lead: ALERT_LEAD_DAYS,
    groups: SURVIVAL_GROUPS,
    day: (r) => penaltyAfter(r, 'Heat', ['Woody biomass', 'Propane']),
    forecast: (res) => res === 'Heat',
  },
  {
    // Feed has no wellbeing penalty (hungry hens lay less), so its cliff is the first day it runs short.
    // Its alert lists once fewer than CONSUMABLE_WARN_DAYS whole days remain: six full days and the partial one.
    id: 'feed',
    label: 'Chicken feed',
    alerts: ['Chicken feed'],
    measuredTo: 'first day Chicken feed runs short (no wellbeing penalty)',
    lead: CONSUMABLE_WARN_DAYS - 1,
    groups: ['now', 'soon', 'supplies'],
    day: (r) => firstShort(r, ['Chicken feed']),
    forecast: () => false,
  },
  {
    // Cash has no penalty of its own: orders and running costs stop, and the penalty that follows is food's or heat's.
    id: 'cash',
    label: 'Cash',
    alerts: ['cash-runway'],
    measuredTo: 'first day cash ends below $1',
    lead: ALERT_LEAD_DAYS,
    groups: SURVIVAL_GROUPS,
    day: (r) => {
      const k = r.ledgers.findIndex((l) => l.cash.end < 1);
      return k < 0 ? null : k;
    },
    forecast: (res) => res === null,
  },
];

export interface Scenario {
  id: string;
  label: string;
  react: boolean;
  settings: Partial<GameState['settings']>;
  start: Start;
  seeds: number[];
}

const { tutorialSeasons: _, tutorialInstructions: _instructions, ...ORIGINAL_LINE } = NEW_GAME_SETTINGS;
const greenfield = getStart('greenfield');

/**
 * The novice gate's own runs, the October 22 playtest (original line, alerts ignored) and two stress
 * starts that reach the cliffs the ordinary runs never do. Every site; the stress starts on seed 1.
 */
export const SCENARIOS: Scenario[] = [
  { id: 'novice', label: 'Novice gate (seasonal line, acts on Act now)', react: true, settings: NEW_GAME_SETTINGS, start: greenfield, seeds: GATE_SEEDS },
  { id: 'playtest', label: 'October 22 playtest (original line, ignores alerts)', react: false, settings: ORIGINAL_LINE, start: greenfield, seeds: GATE_SEEDS },
  {
    id: 'no-water-gathering',
    label: 'No automatic water gathering (ignores alerts)',
    react: false,
    settings: NEW_GAME_SETTINGS,
    start: { ...greenfield, autoGather: { ...greenfield.autoGather!, waterDays: 0 } },
    seeds: [1],
  },
  {
    id: 'low-cash',
    label: '$600 starting cash (ignores alerts)',
    react: false,
    settings: NEW_GAME_SETTINGS,
    start: { ...greenfield, cash: 600 },
    seeds: [1],
  },
];

/** The novice, plus the first wellbeing penalty per need as the household felt it. */
function penaltyProbe(inner: Bot, penalties: Record<string, number>): Bot {
  let start: number | null = null;
  return {
    ...inner,
    act(catalog, state, log) {
      start ??= state.calendar.absDay;
      // This morning's wellbeing terms are yesterday's: a term past its grace days is a penalty.
      const yesterday = state.calendar.absDay - start - 1;
      if (yesterday >= 0)
        for (const i of state.instances)
          for (const t of i.person?.why ?? [])
            if (t.points < 0 && / met for \d+ days$/.test(t.label)) penalties[t.label.split(':')[0]!] ??= yesterday;
      return inner.act(catalog, state, log);
    },
  };
}

export function playCoverage(s: Scenario, site: string, seed: number, days = 365, catalog: Catalog = defaultCatalog): CoverageRun {
  const bot = noviceBot({ react: s.react });
  const penalties: Record<string, number> = {};
  const r = playBot(penaltyProbe(bot, penalties), { start: s.start, site, difficulty: 'real', seed, days, catalog, settings: s.settings });
  return { ...r, penalties, shown: bot.shown! };
}

export interface CliffCheck {
  cliff: Cliff;
  /** Run day of the cliff, null when it never happened. */
  day: number | null;
  /** Mornings in a row, ending on the cliff day, that a warning was listed in an allowed section. */
  lead: number;
  /** The warning's best place in the list on its first morning of that streak (0 = top). */
  rank: number | null;
  /** First warning that streak shows. */
  alert: string | null;
  /** First morning the forecast named the cliff (days before it), for context only. */
  forecastLead: number | null;
  pass: boolean;
}

export function checkCliffs(r: CoverageRun): CliffCheck[] {
  const byDay = new Map<number, NonNullable<Bot['shown']>>();
  for (const a of r.shown) byDay.set(a.day, [...(byDay.get(a.day) ?? []), a]);
  return CLIFFS.map((cliff) => {
    const day = cliff.day(r);
    if (day === null) return { cliff, day, lead: 0, rank: null, alert: null, forecastLead: null, pass: true };
    const warning = (d: number) => (byDay.get(d) ?? []).filter((a) => cliff.alerts.includes(a.id) && cliff.groups.includes(a.group));
    let from = day;
    while (from > 0 && warning(from - 1).length) from--;
    const first = warning(from)[0];
    const lead = day - from;
    const f = r.shown.find((a) => a.id === 'forecast' && a.day <= day && cliff.forecast(a.resource));
    return { cliff, day, lead, rank: first && lead ? first.rank : null, alert: first && lead ? first.id : null, forecastLead: f ? day - f.day : null, pass: lead >= cliff.lead };
  });
}

export interface CoverageResult {
  scenario: Scenario;
  site: string;
  seed: number;
  checks: CliffCheck[];
}

export function runCoverage(o: { scenarios?: Scenario[]; sites?: string[]; days?: number } = {}): CoverageResult[] {
  const out: CoverageResult[] = [];
  for (const scenario of o.scenarios ?? SCENARIOS)
    for (const site of o.sites ?? GATE_SITES)
      for (const seed of scenario.seeds) out.push({ scenario, site, seed, checks: checkCliffs(playCoverage(scenario, site, seed, o.days)) });
  return out;
}

/** Where each cliff must be reached, so the coverage can't pass by never testing it. */
export const EXPECTED_SITES: Record<string, string[]> = {
  food: GATE_SITES,
  water: GATE_SITES,
  carbon: GATE_SITES,
  feed: GATE_SITES,
  cash: GATE_SITES,
  // Only Laramie's novice runs out of firewood before a heat penalty: elsewhere the cold quest's wood order arrives in time.
  fuel: ['laramie-wy'],
};

/** A Markdown report: one row per cliff reached, then which cliffs each scenario reached. */
export function coverageReport(results: CoverageResult[]): { text: string; pass: boolean } {
  const lines = [
    '# Alert coverage (LL-49)',
    '',
    `Reproduce with \`npm run sim -- coverage --md docs/LL_49_COVERAGE.md\`. Real weather, 365 days, the rules a new game sets. A cliff passes when one of its alerts was on the Needs and bottlenecks list, in an allowed section, every morning for at least ${ALERT_LEAD_DAYS} days before it (feed: ${CONSUMABLE_WARN_DAYS - 1}). Lead = mornings in a row the warning was listed, ending on the cliff day. Rank = its place in the list on the first of those mornings (1 = top). Forecast = days before the cliff that the 90-day forecast first named it; context only, never counted.`,
    '',
    '| Cliff | Measured to | Alerts that count | Lead needed |',
    '|---|---|---|---|',
    ...CLIFFS.map((c) => `| ${c.label} | ${c.measuredTo} | ${c.alerts.join(', ')} (${c.groups.join('/')}) | ${c.lead} |`),
    '',
    '| Scenario | Site | Seed | Cliff | Day | Lead | Warning | Rank | Forecast | Result |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of results)
    for (const c of r.checks)
      if (c.day !== null)
        lines.push(`| ${r.scenario.label} | ${r.site} | ${r.seed} | ${c.cliff.label} | ${c.day + 1} | ${c.lead} | ${c.alert ?? '—'} | ${c.rank === null ? '—' : c.rank + 1} | ${c.forecastLead ?? '—'} | ${c.pass ? 'pass' : '**FAIL**'} |`);
  const missing: string[] = [];
  for (const [cliff, sites] of Object.entries(EXPECTED_SITES))
    for (const site of sites)
      if (!results.some((r) => r.site === site && r.checks.some((c) => c.cliff.id === cliff && c.day !== null))) missing.push(`${cliff} on ${site}`);
  lines.push('', 'Runs that reach no cliff (every novice gate run among them) pass without a row.');
  if (missing.length) lines.push('', `**Not reached:** ${missing.join(', ')}.`);
  const pass = !missing.length && results.every((r) => r.checks.every((c) => c.pass));
  return { text: lines.join('\n'), pass };
}
