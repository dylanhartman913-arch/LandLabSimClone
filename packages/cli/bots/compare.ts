import { catalog as defaultCatalog, getQuestLine, type Catalog, type Difficulty, type QuestStep } from '@homestead/catalog';
import {
  applyAction,
  climateTable,
  currentQuest,
  hireConstruction,
  homegrownShare,
  HEAT_HDD_MIN,
  recoveryRoute,
  replay,
  stepDay,
  SURVIVAL,
  weeklyBills,
  type Action,
  type ActionBody,
  type DayLedger,
  type GameEvent,
  type GameInit,
  type GameState,
} from '@homestead/engine';
import winterFixture from '../../engine/test/fixtures/playtest/winter.json' with { type: 'json' };
import { playBot, type PlayResult } from './run.ts';
import { doStep } from './steps.ts';
import type { Bot } from './types.ts';

/**
 * Controlled first-year comparisons (LL-10). Each comparison holds start, site, household,
 * difficulty, seed and the action schedule fixed, and changes one decision. Measurement only:
 * nothing here changes balance constants.
 */

export const COMPARE_SITES = ['front-range', 'laramie-wy', 'asheville-nc'];
export const COMPARE_SEEDS = [1, 2, 3];
export const COMPARE_DAYS = 365;
/** What a new game started in the app sets (NewGame.tsx): the same rules a player gets today. */
export const NEW_GAME_SETTINGS = { safeRecovery: true, reuseIdleLabor: true };

/** A decision taken on a fixed day offset from the start, whatever the run has done so far. */
interface Decision {
  day: number | ((s: GameState) => number);
  label: string;
  apply(catalog: Catalog, state: GameState, log: Action[], skipped: string[]): GameState;
}

const steps = (list: QuestStep[]): Decision['apply'] => (catalog, state, log, skipped) => {
  for (const step of list) state = doStep(catalog, state, step, log, skipped);
  return state;
};
const place = (system: string, mode: 'buy' | 'diy' = 'diy'): QuestStep =>
  ({ do: 'place', system, mode, count: 1, near: 'home', on: false }) as QuestStep;

/** Days from the start to the first average-climate cold day (HDD > 22), as the Work panel warns. */
export function firstColdDay(state: GameState): number {
  const climate = climateTable(state.site);
  let d = 0;
  while (d < 365 && climate.days[(state.calendar.day + d) % 365]!.hdd <= 22) d++;
  return d;
}

/**
 * The tutorial route a novice follows, optionally without some quests' own steps, plus fixed
 * decisions. Every variant in a comparison shares this policy; only its decisions differ.
 */
function routeBot(o: { decisions?: Decision[]; withoutQuestSteps?: string[] } = {}): Bot {
  const skipped: string[] = [];
  const drop = new Set(o.withoutQuestSteps ?? []);
  const doneQuests = new Set<string>();
  const doneDecisions = new Set<number>();
  let start: number | null = null;
  let first: GameState | null = null;
  return {
    name: 'route',
    act(catalog, state, log) {
      start ??= state.calendar.absDay;
      first ??= state;
      // The tutorial follower's policy: each quest's own steps once, when it becomes current.
      const q = currentQuest(state);
      if (q && !doneQuests.has(q.id)) {
        doneQuests.add(q.id);
        if (!drop.has(q.id)) for (const step of q.steps) state = doStep(catalog, state, step, log, skipped);
        if (q.goal.kind === 'ui') state = doStep(catalog, state, { do: 'open', panel: q.goal.panel }, log, skipped);
      }
      const today = state.calendar.absDay - start;
      (o.decisions ?? []).forEach((d, k) => {
        if (!doneDecisions.has(k) && today >= (typeof d.day === 'number' ? d.day : d.day(first!))) {
          doneDecisions.add(k);
          state = d.apply(catalog, state, log, skipped);
        }
      });
      return state;
    },
  };
}

/** Replays another run's player actions on the same days (re-numbering placements), for tutorial off. */
function scheduleBot(actions: Action[], skipTutorial: boolean): Bot {
  const ids = new Map<string, string>();
  const pending = actions.filter((a) => a.kind !== 'ui' && a.kind !== 'tutorial');
  let started = false;
  return {
    name: 'schedule',
    act(catalog, state, log) {
      const apply = (body: ActionBody) => {
        const a = { ...body, at: state.calendar.absDay } as Action;
        try {
          state = applyAction(catalog, state, a);
          log.push(a);
          return true;
        } catch {
          return false;
        }
      };
      if (!started) {
        started = true;
        if (skipTutorial) apply({ kind: 'tutorial', skip: true });
      }
      while (pending.length && pending[0]!.at <= state.calendar.absDay) {
        const { at: _at, ...body } = pending.shift()!;
        const remap = (id: string) => ids.get(id) ?? id;
        if (body.kind === 'place') {
          const id = `i${state.nextInstanceId}`;
          if (apply({ ...body, id })) ids.set(body.id, id);
        } else if (body.kind === 'hireConstruction' || body.kind === 'remove') apply({ ...body, id: remap(body.id) });
        else if (body.kind === 'priority') apply({ ...body, id: remap(body.id) });
        else apply(body as ActionBody);
      }
      return state;
    },
  };
}

export interface RunMetrics {
  /** Days with any survival need below its shortage threshold while someone is home. */
  essentialShortDays: number;
  minWellbeing: number;
  departures: number;
  daysAway: number;
  /** Average length of a town stay, in days (null without one). */
  recoveryDays: number | null;
  /** Prepared Food on hand at the end, in days of household demand. */
  pantryDays: number;
  cashEnd: number;
  cashMin: number;
  weeklyBills: number;
  labor: { employment: number; maintenance: number; gathering: number; construction: number; available: number };
  /** First seven days, before any collapse: employment and available hours, and cash earned. */
  firstWeek: { employment: number; available: number; income: number };
  built: { day: number; system: string }[];
  /** Home-grown share of food eaten over the run, and its best 30-day window. */
  homegrownYear: number;
  homegrownBest30: number;
  /** Cash plus market value of tutorial reward stock received. */
  subsidy: number;
  skippedActions: number;
}

const SURVIVAL_ROWS = [
  ['drinkingWater', 'Drinking water'],
  ['food', 'Food'],
  ['shelter', 'Shelter'],
  ['heat', 'Heated shelter'],
  ['sanitation', 'Sanitation'],
] as const;

export function measure(r: PlayResult, catalog: Catalog, extraSkipped = 0): RunMetrics {
  const ledgers = r.ledgers;
  const income = new Set(catalog.flows.filter((f) => f.direction === 'out' && f.resource === 'Capital').map((f) => f.systemId));
  const short = (l: DayLedger) =>
    l.wellbeing !== null &&
    SURVIVAL_ROWS.some(([key, row]) => {
      if (key === 'heat' && l.weather.hdd <= HEAT_HDD_MIN) return false;
      const n = l.needs[row];
      return n.needed > 1e-9 && n.delivered / n.needed < SURVIVAL[key].short - 1e-9;
    });
  const spells: number[] = [];
  let run = 0;
  for (const l of ledgers) {
    if (l.away > 0) run++;
    else if (run) {
      spells.push(run);
      run = 0;
    }
  }
  if (run) spells.push(run);
  const labor = { employment: 0, maintenance: 0, gathering: 0, construction: 0, available: 0 };
  for (const l of ledgers) {
    const byJob = l.labor.byJob ?? { construction: l.labor.construction, upkeep: l.labor.upkeepDelivered };
    let paid = 0;
    for (const [id, h] of Object.entries(l.laborBySystem)) if (income.has(id)) paid += h;
    labor.employment += paid;
    labor.maintenance += Math.max(0, (byJob.upkeep ?? 0) - paid);
    labor.construction += byJob.construction ?? 0;
    for (const [job, h] of Object.entries(byJob)) if (job.startsWith('gather-')) labor.gathering += h ?? 0;
    labor.available += l.labor.pool;
  }
  const week = ledgers.slice(0, 7);
  const firstWeek = {
    employment: week.reduce((a, l) => a + Object.entries(l.laborBySystem).reduce((b, [id, h]) => b + (income.has(id) ? h : 0), 0), 0),
    available: week.reduce((a, l) => a + l.labor.pool, 0),
    income: week.reduce((a, l) => a + l.cash.in, 0),
  };
  const foodNeed = ledgers.slice(-7).reduce((a, l) => a + l.needs.Food.needed, 0) / 7;
  const bills = weeklyBills({ ledgers } as unknown as GameState);
  const start = ledgers[0]!.absDay;
  const name = (id: string) => catalog.systems.find((s) => s.id === id)?.name ?? id;
  let best30 = 0;
  for (let k = 30; k <= ledgers.length; k += 5)
    best30 = Math.max(best30, homegrownShare({ ledgers: ledgers.slice(0, k) } as unknown as GameState, catalog, 30));
  const quests = new Map(getQuestLine('greenfield').quests.map((q) => [q.id, q.reward]));
  let subsidy = 0;
  for (const e of r.events as GameEvent[]) {
    if (e.kind !== 'quest') continue;
    const reward = quests.get(e.questId);
    if (!reward) continue;
    subsidy += reward.cash ?? 0;
    for (const [res, amt] of Object.entries(reward.stock ?? {}))
      subsidy += amt * (catalog.resources.find((x) => x.name === res)?.marketPrice ?? 0);
  }
  return {
    essentialShortDays: ledgers.filter(short).length,
    minWellbeing: Math.min(...ledgers.map((l) => (l.away > 0 ? 0 : (l.wellbeing ?? 0)))),
    departures: r.events.filter((e) => e.kind === 'went-to-town').length,
    daysAway: ledgers.filter((l) => l.away > 0).length,
    recoveryDays: spells.length ? spells.reduce((a, b) => a + b, 0) / spells.length : null,
    pantryDays: foodNeed > 0 ? (r.state.stocks.Food ?? 0) / foodNeed : 0,
    cashEnd: r.state.cash,
    cashMin: Math.min(...ledgers.map((l) => l.cash.end)),
    weeklyBills: bills.weeks.length ? bills.weeks.reduce((a, w) => a + w, 0) / bills.weeks.length : 0,
    labor,
    firstWeek,
    built: r.events.filter((e) => e.kind === 'built').map((e) => ({ day: e.absDay - start, system: name((e as { systemId: string }).systemId) })),
    homegrownYear: homegrownShare({ ledgers } as unknown as GameState, catalog, ledgers.length),
    homegrownBest30: best30,
    subsidy,
    skippedActions: extraSkipped,
  };
}

export interface Variant {
  id: string;
  label: string;
  /** Builds the bot; `baseline` is the same site/seed run of the comparison's first variant. */
  bot(baseline: PlayResult | null): Bot;
}

export interface Comparison {
  id: string;
  question: string;
  variants: Variant[];
}

const coldSteps: QuestStep[] = getQuestLine('greenfield').quests.find((q) => q.id === 'gf-cold')!.steps;
const earlyPrep: Decision = { day: (s) => Math.max(0, firstColdDay(s) - 60), label: 'winter prep 60 days early', apply: steps(coldSteps) };
const latePrep: Decision = { day: (s) => Math.max(0, firstColdDay(s) - 7), label: 'winter prep 7 days early', apply: steps(coldSteps) };
const crewForHeater: Decision = {
  day: (s) => Math.max(0, firstColdDay(s) - 7),
  label: 'book a crew for the heater',
  apply(catalog, state, log, skipped) {
    const heater = catalog.systems.find((s) => s.name === 'Rocket Mass Heater')!.id;
    const i = state.instances.find((x) => x.systemId === heater && x.status === 'building' && !x.contractor);
    if (!i) {
      skipped.push('crew: no heater under construction');
      return state;
    }
    try {
      const a = { kind: 'hireConstruction', id: i.id, at: state.calendar.absDay } as Action;
      state = hireConstruction(state, i.id);
      log.push(a);
    } catch (e) {
      skipped.push(`crew: ${e instanceof Error ? e.message : String(e)}`);
    }
    return state;
  },
};
const atStart = (label: string, list: QuestStep[]): Decision => ({ day: 0, label, apply: steps(list) });

export const COMPARISONS: Comparison[] = [
  {
    id: 'tutorial',
    question: 'Is viability dependent on gifts that are absent outside onboarding?',
    variants: [
      { id: 'on', label: 'Tutorial on (gifts)', bot: () => routeBot() },
      { id: 'off', label: 'Same actions, same days, tutorial skipped (no gifts)', bot: (b) => scheduleBot(b!.actions, true) },
    ],
  },
  {
    id: 'job',
    question: 'How much do income and competing labor determine success?',
    variants: [
      { id: 'none', label: 'No job', bot: () => routeBot() },
      { id: 'part', label: 'Part-time job (20 h, needs transport)', bot: () => routeBot({ decisions: [atStart('part-time job', [place('Part-Time Job (20 hrs)', 'buy')])] }) },
      { id: 'remote', label: 'Remote job (40 h)', bot: () => routeBot({ decisions: [atStart('remote job', [place('Remote Job (40 hrs)', 'buy')])] }) },
    ],
  },
  {
    id: 'shelter',
    question: 'Is there a viable shelter progression within the starter budget?',
    variants: [
      { id: 'none', label: 'Starter tent only', bot: () => routeBot() },
      { id: 'bell', label: 'Second inexpensive shelter (Bell Tent, DIY) on day 30', bot: () => routeBot({ decisions: [{ day: 30, label: 'bell tent', apply: steps([place('Bell Tent')]) }] }) },
      { id: 'yurt', label: 'Yurt (DIY) on day 30', bot: () => routeBot({ decisions: [{ day: 30, label: 'yurt', apply: steps([place('Yurt')]) }] }) },
    ],
  },
  {
    id: 'storage',
    question: 'Is water the intended first bottleneck, and is that discoverable?',
    variants: [
      { id: 'tutorial', label: 'Tutorial order, no added storage', bot: () => routeBot() },
      { id: 'storage-first', label: '550 gal cistern (DIY) on day 0, before crops', bot: () => routeBot({ decisions: [atStart('cistern', [place('Rainwater Collection System + Cistern (550 Gallons)')])] }) },
      { id: 'crops-first', label: 'Same cistern on day 90, after crops', bot: () => routeBot({ decisions: [{ day: 90, label: 'cistern', apply: steps([place('Rainwater Collection System + Cistern (550 Gallons)')]) }] }) },
    ],
  },
  {
    id: 'winter',
    question: 'Is the warning lead time sufficient for real construction ETAs?',
    variants: [
      { id: 'tutorial', label: 'Winter steps when the tutorial reaches them', bot: () => routeBot() },
      { id: 'early', label: 'Heater, wood rule and order 60 days before first cold', bot: () => routeBot({ withoutQuestSteps: ['gf-cold'], decisions: [earlyPrep] }) },
      { id: 'late', label: 'The same 7 days before first cold', bot: () => routeBot({ withoutQuestSteps: ['gf-cold'], decisions: [latePrep] }) },
    ],
  },
  {
    id: 'rescue',
    question: 'Does recovery have a reasonable price and duration?',
    variants: [
      { id: 'household', label: 'Late heater built by household labor', bot: () => routeBot({ withoutQuestSteps: ['gf-cold'], decisions: [latePrep] }) },
      { id: 'crew', label: 'Late heater with a paid crew booked the same day', bot: () => routeBot({ withoutQuestSteps: ['gf-cold'], decisions: [latePrep, crewForHeater] }) },
    ],
  },
  {
    id: 'stacking',
    question: 'Are per-person employment and labor limits enforced?',
    variants: [
      { id: 'one', label: 'One remote job', bot: () => routeBot({ decisions: [atStart('remote job', [place('Remote Job (40 hrs)', 'buy')])] }) },
      { id: 'three', label: 'Three remote jobs for two adults', bot: () => routeBot({ decisions: [atStart('three remote jobs', [{ ...place('Remote Job (40 hrs)', 'buy'), count: 3 } as QuestStep])] }) },
    ],
  },
];

export interface VariantRun {
  site: string;
  difficulty: Difficulty;
  seed: number;
  metrics: RunMetrics;
}

export interface ComparisonResult {
  comparison: Comparison;
  variants: { variant: Variant; runs: VariantRun[] }[];
}

/** Run comparisons in Standard (one run per site) and real weather (each seed per site), start greenfield, 2 adults. */
export function runComparisons(o: { comparisons?: Comparison[]; sites?: string[]; seeds?: number[]; days?: number; catalog?: Catalog } = {}): ComparisonResult[] {
  const catalog = o.catalog ?? defaultCatalog;
  const days = o.days ?? COMPARE_DAYS;
  const cells: { difficulty: Difficulty; seed: number }[] = [
    { difficulty: 'standard', seed: 1 },
    ...(o.seeds ?? COMPARE_SEEDS).map((seed) => ({ difficulty: 'real' as Difficulty, seed })),
  ];
  return (o.comparisons ?? COMPARISONS).map((comparison) => {
    const out = comparison.variants.map((variant) => ({ variant, runs: [] as VariantRun[] }));
    for (const site of o.sites ?? COMPARE_SITES)
      for (const cell of cells) {
        let baseline: PlayResult | null = null;
        comparison.variants.forEach((variant, k) => {
          const r = playBot(variant.bot(baseline), { start: 'greenfield', site, difficulty: cell.difficulty, seed: cell.seed, days, catalog, settings: NEW_GAME_SETTINGS });
          baseline ??= r;
          const expected = baseline.actions.filter((a) => a.kind !== 'ui' && a.kind !== 'tutorial').length;
          const got = r.actions.filter((a) => a.kind !== 'ui' && a.kind !== 'tutorial').length;
          out[k]!.runs.push({ site, ...cell, metrics: measure(r, catalog, variant.id === 'off' ? Math.max(0, expected - got) : 0) });
        });
      }
    return { comparison, variants: out };
  });
}

/** The recorded day-240 winter save (front range, zero resident labor): what each rescue costs and how long it takes. */
export function winterRescue(days = 90, catalog: Catalog = defaultCatalog) {
  const base = applyAction(
    catalog,
    replay(catalog, winterFixture.init as GameInit, winterFixture.actions as Action[], winterFixture.absDay),
    { at: winterFixture.absDay, kind: 'settings', settings: NEW_GAME_SETTINGS },
  );
  const play = (label: string, prepare: (s: GameState) => GameState) => {
    let state = prepare(base);
    const cash0 = base.cash;
    const ledgers: DayLedger[] = [];
    const events: GameEvent[] = [];
    for (let k = 0; k < days; k++) {
      const r = stepDay(state, catalog);
      state = r.state;
      ledgers.push(r.ledger);
      events.push(...r.events);
    }
    const home = events.find((e) => e.kind === 'came-home');
    const left = events.filter((e) => e.kind === 'went-to-town' && home && e.absDay > home.absDay);
    return {
      label,
      prepaid: cash0 - prepare(base).cash,
      homeDay: home ? home.absDay - base.calendar.absDay : null,
      leftAgain: left.length > 0,
      homeAtEnd: !state.instances.some((i) => i.person?.away),
      cashEnd: state.cash,
      lowestCash: Math.min(...ledgers.map((l) => l.cash.end)),
    };
  };
  const route = recoveryRoute(base, catalog)!;
  return [
    play('Do nothing (zero resident labor)', (s) => s),
    play('Emergency construction only', (s) => applyAction(catalog, s, { at: s.calendar.absDay, kind: 'settings', settings: { emergencyConstruction: true } })),
    play('Recovery route (crews, upkeep first, orders)', (s) => route.actions.reduce((g, b) => applyAction(catalog, g, { ...b, at: g.calendar.absDay } as Action), s)),
  ];
}
