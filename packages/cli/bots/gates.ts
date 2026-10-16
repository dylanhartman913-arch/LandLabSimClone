import { catalog as defaultCatalog, getSite, type Catalog, type Difficulty } from '@homestead/catalog';
import { homegrownShare, weeklyBills, type DayLedger, type GameState } from '@homestead/engine';
import { adaptUpgraderBot } from './adaptUpgrader.ts';
import { idleBot } from './idle.ts';
import { playBot, type PlayResult } from './run.ts';
import { tutorialFollowerBot } from './tutorialFollower.ts';
import type { Bot } from './types.ts';

export const GATE_SEEDS = [1, 2, 3];
export const GATE_SITES = ['front-range', 'laramie-wy', 'asheville-nc'];

export interface GateRun {
  site: string;
  seed: number;
  pass: boolean;
  /** Plain-language numbers behind the verdict. */
  detail: string;
}

export interface Gate {
  id: string;
  start: string;
  difficulty: Difficulty;
  bot: string;
  rule: string;
  days: number;
  makeBot(): Bot;
  /** One run's verdict. */
  check(r: PlayResult, site: string, catalog: Catalog): { pass: boolean; detail: string };
  /** Across seeds on one site (default: every seed passes). */
  combine?(runs: GateRun[]): boolean;
}

const away = (l: DayLedger) => l.away > 0;
const firstDay = (r: PlayResult, pred: (l: DayLedger) => boolean): number => {
  const i = r.ledgers.findIndex(pred);
  return i < 0 ? Infinity : i;
};
const firstHardship = (r: PlayResult) => {
  const start = r.ledgers[0]!.absDay;
  const h = r.events.find((e) => e.kind === 'hardship');
  return h ? h.absDay - start : Infinity;
};
const fmtDay = (d: number) => (Number.isFinite(d) ? `day ${d + 1}` : 'never');

/** Monthly (30-day) average wellbeing of the people at home; a month with anyone away counts 0. */
function monthlyWellbeing(ledgers: DayLedger[]): number[] {
  const out: number[] = [];
  for (let k = 0; k + 30 <= ledgers.length; k += 30) {
    const m = ledgers.slice(k, k + 30);
    out.push(m.some(away) ? 0 : m.reduce((a, l) => a + (l.wellbeing ?? 0), 0) / m.length);
  }
  return out;
}

/** Best 30-day home-grown food share that ends on or before the site's first fall frost. */
function homegrownByAutumn(r: PlayResult, site: string, catalog: Catalog): number {
  const frost = getSite(site).growingSeason.endDay - 1;
  let best = 0;
  for (let k = 30; k <= r.ledgers.length; k++) {
    const l = r.ledgers[k - 1]!;
    if (l.year > r.ledgers[0]!.year || l.day > frost) break;
    const fake = { ledgers: r.ledgers.slice(0, k) } as unknown as GameState;
    best = Math.max(best, homegrownShare(fake, catalog, 30));
  }
  return best;
}

function billsChange(r: PlayResult): { first: number; last: number } {
  const avg = (ls: DayLedger[]) => {
    const s = { ledgers: ls } as unknown as GameState;
    const b = weeklyBills(s);
    return b.weeks.length ? b.weeks.reduce((a, w) => a + w, 0) / b.weeks.length : 0;
  };
  return { first: avg(r.ledgers.slice(7, 35)), last: avg(r.ledgers.slice(-28)) };
}

/** The pacing gates (playability roadmap, G16). CI fails if any misses. */
export const GATES: Gate[] = [
  {
    id: 'greenfield-idle',
    start: 'greenfield',
    difficulty: 'standard',
    bot: 'idle',
    rule: 'no hardship for 28 days; nobody leaves before day 60',
    days: 60,
    makeBot: idleBot,
    check(r) {
      const h = firstHardship(r);
      const a = firstDay(r, away);
      return { pass: h >= 28 && a >= 60, detail: `first hardship ${fmtDay(h)}, first to town ${fmtDay(a)}` };
    },
  },
  {
    id: 'greenfield-tutorial',
    start: 'greenfield',
    difficulty: 'standard',
    bot: 'tutorialFollower',
    rule: 'wellbeing ≥ 60 every month of year 1; home-grown food ≥ 25% for a month by the first fall frost',
    days: 360,
    makeBot: tutorialFollowerBot,
    check(r, site, catalog) {
      const months = monthlyWellbeing(r.ledgers);
      const low = Math.min(...months);
      const food = homegrownByAutumn(r, site, catalog);
      return {
        pass: low >= 60 && food >= 0.25,
        detail: `lowest month ${low.toFixed(0)}, best home-grown month by frost ${(food * 100).toFixed(0)}%, quests ${Object.keys(r.state.tutorial?.done ?? {}).length}`,
      };
    },
  },
  {
    id: 'greenfield-gentle-idle',
    start: 'greenfield',
    difficulty: 'gentle',
    bot: 'idle',
    rule: 'nobody leaves before day 90',
    days: 90,
    makeBot: idleBot,
    check(r) {
      const a = firstDay(r, away);
      return { pass: a >= 90, detail: `first to town ${fmtDay(a)}` };
    },
  },
  {
    id: 'greenfield-real-tutorial',
    start: 'greenfield',
    difficulty: 'real',
    bot: 'tutorialFollower',
    rule: 'survives year 1 (nobody goes to town) in at least 2 of 3 seeds',
    days: 365,
    makeBot: tutorialFollowerBot,
    check(r) {
      const a = firstDay(r, away);
      return { pass: !Number.isFinite(a), detail: `first to town ${fmtDay(a)}` };
    },
    combine: (runs) => runs.filter((x) => x.pass).length >= 2,
  },
  {
    id: 'adapt-upgrader',
    start: 'adapt',
    difficulty: 'standard',
    bot: 'adaptUpgrader',
    rule: 'weekly bills fall ≥ 20% by the end of year 1; wellbeing ≥ 70 throughout',
    days: 365,
    makeBot: adaptUpgraderBot,
    check(r) {
      const { first, last } = billsChange(r);
      const fall = first > 0 ? 1 - last / first : 0;
      const low = Math.min(...r.ledgers.map((l) => l.wellbeing ?? 0));
      return { pass: fall >= 0.2 && low >= 70, detail: `bills $${first.toFixed(0)} → $${last.toFixed(0)} a week (${(fall * 100).toFixed(0)}% lower), lowest wellbeing ${low.toFixed(0)}` };
    },
  },
];

export interface GateResult {
  gate: Gate;
  site: string;
  runs: GateRun[];
  pass: boolean;
}

/** Run every gate on every site and seed. */
export function runGates(opts: { gates?: Gate[]; sites?: string[]; seeds?: number[]; catalog?: Catalog } = {}): GateResult[] {
  const catalog = opts.catalog ?? defaultCatalog;
  const out: GateResult[] = [];
  for (const gate of opts.gates ?? GATES) {
    for (const site of opts.sites ?? GATE_SITES) {
      const runs: GateRun[] = [];
      for (const seed of opts.seeds ?? GATE_SEEDS) {
        const r = playBot(gate.makeBot(), { start: gate.start, site, difficulty: gate.difficulty, seed, days: gate.days, catalog });
        runs.push({ site, seed, ...gate.check(r, site, catalog) });
      }
      out.push({ gate, site, runs, pass: gate.combine ? gate.combine(runs) : runs.every((x) => x.pass) });
    }
  }
  return out;
}
