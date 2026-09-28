import { NEED_KEYS, type AssumptionKey, type Catalog, type NeedKey } from '@homestead/catalog';
import type { BalanceResult } from '../balance/balance.ts';
import { explained, type Explained } from '../provenance.ts';
import { summarizeLedgers } from '../time/summarize.ts';
import type { DayLedger, GameState } from '../time/types.ts';
import { designBalance, seasonOf } from './hud.ts';

export type ChecklistMode = 'average' | 'season' | 'worst';

export interface ChecklistRowView {
  need: NeedKey;
  unit: string;
  provided: Explained;
  needed: Explained;
  pct: Explained;
  covered: '✓' | '✗' | 'n/a';
  /** Weekly coverage (delivered ÷ needed) for up to the last 52 weeks, oldest first. */
  sparkline: number[];
}

export interface ChecklistView {
  mode: ChecklistMode;
  humans: number;
  rows: ChecklistRowView[];
  overall: Explained;
  /** Plain-language summary of the result. */
  summary: string;
  /** Which days a time-mode view covers. */
  range: { from: number; to: number } | null;
}

const UNITS: Record<NeedKey, string> = {
  Water: 'gal',
  'Drinking water': 'gal',
  Food: 'kcal',
  Shelter: 'sq ft',
  Sanitation: 'lbs',
  Electricity: 'kWh',
  Transportation: 'miles',
  'Cooking fuel': 'hours',
  'Heated shelter': 'BTU',
  'Cooled shelter': 'BTU',
  'Est. Required Labor': 'hours',
};

/** Weekly coverage per row over the ledgers kept in state (last 52 weeks). */
export function sparklines(ledgers: readonly DayLedger[]): Record<NeedKey, number[]> {
  const out = {} as Record<NeedKey, number[]>;
  for (const k of NEED_KEYS) out[k] = [];
  const recent = ledgers.slice(-364);
  const start = recent.length % 7;
  for (let i = start; i + 7 <= recent.length; i += 7) {
    for (const k of NEED_KEYS) {
      let n = 0;
      let d = 0;
      for (let j = i; j < i + 7; j++) {
        n += recent[j]!.needs[k].needed;
        d += recent[j]!.needs[k].delivered;
      }
      out[k].push(n > 0 ? Math.min(1, d / n) : 1);
    }
  }
  return out;
}

function summaryText(rows: ChecklistRowView[], overall: number, mode: ChecklistMode): string {
  const scored = rows.filter((r) => r.covered !== 'n/a');
  const met = scored.filter((r) => r.covered === '✓').map((r) => r.need);
  const worst = [...scored]
    .sort((a, b) => a.pct.value - b.pct.value)
    .slice(0, 2)
    .filter((r) => r.pct.value < 1);
  const when =
    mode === 'average'
      ? 'In an average year'
      : mode === 'season'
        ? 'This season'
        : 'In the worst week this year';
  const pct = `${Math.round(overall * 100)}%`;
  if (!scored.length)
    return 'Nothing in the design needs anything yet. Add people to see what a household needs.';
  const metText = met.length ? `fully covers ${met.join(', ')}` : 'fully covers nothing yet';
  const gap = worst.length
    ? ` The biggest gaps are ${worst.map((r) => `${r.need} (${Math.round(r.pct.value * 100)}%)`).join(' and ')}.`
    : '';
  return `${when} your design covers ${pct} of the household's needs and ${metText}.${gap}`;
}

/**
 * The Needs Checklist in three views. "Average year" is balance mode, exactly.
 * "This season" and "Worst week this year" come from time-mode ledgers.
 */
export function checklistView(
  state: GameState,
  catalog: Catalog,
  mode: ChecklistMode,
  bal: BalanceResult = designBalance(state, catalog),
): ChecklistView {
  const spark = sparklines(state.ledgers);
  if (mode === 'average' || state.ledgers.length === 0) {
    const rows: ChecklistRowView[] = bal.checklist.map((r) => ({
      need: r.need,
      unit: r.unit,
      provided: r.provided,
      needed: r.needed,
      pct: r.pct,
      covered: r.covered,
      sparkline: spark[r.need],
    }));
    return {
      mode: 'average',
      humans: bal.humans.value,
      rows,
      overall: bal.overallScore,
      summary: summaryText(rows, bal.overallScore.value, 'average'),
      range: null,
    };
  }

  const year = state.calendar.year;
  let ledgers: DayLedger[];
  if (mode === 'season') {
    const season = seasonOf(state.ledgers.at(-1)!.day);
    ledgers = [];
    for (let i = state.ledgers.length - 1; i >= 0; i--) {
      const l = state.ledgers[i]!;
      if (seasonOf(l.day) !== season) break;
      ledgers.unshift(l);
    }
  } else {
    const thisYear = state.ledgers.filter((l) => l.year === year);
    ledgers = thisYear.length >= 7 ? thisYear : state.ledgers.slice(-7);
  }
  let window = ledgers;
  if (mode === 'worst' && ledgers.length >= 7) {
    // The 7-day window with the lowest average coverage across rows that need anything.
    let bestI = 0;
    let bestScore = Infinity;
    for (let i = 0; i + 7 <= ledgers.length; i++) {
      const s = summarizeLedgers(ledgers.slice(i, i + 7), catalog).overallScore;
      if (s < bestScore) {
        bestScore = s;
        bestI = i;
      }
    }
    window = ledgers.slice(bestI, bestI + 7);
  }
  const sum = summarizeLedgers(window, catalog);
  const from = window[0]!.absDay;
  const to = window.at(-1)!.absDay;
  const days = window.length;
  const curtailed = new Map<string, Set<string>>();
  for (const l of window) {
    for (const c of l.curtailed) {
      if (!c.limitedBy) continue;
      const set = curtailed.get(c.limitedBy) ?? new Set<string>();
      set.add(c.systemId);
      curtailed.set(c.limitedBy, set);
    }
  }
  const feeding = (need: NeedKey) => catalog.resources.filter((r) => r.needsRow === need).map((r) => r.name);
  const rows: ChecklistRowView[] = sum.checklist.map((r) => {
    const notes: string[] = [];
    for (const res of feeding(r.need)) {
      const sys = curtailed.get(res);
      if (sys?.size) {
        const names = [...sys].map((id) => catalog.systems.find((x) => x.id === id)?.name ?? id);
        notes.push(`Short on ${res}: curtails ${names.join(', ')}`);
      }
    }
    const label = mode === 'season' ? 'this season' : 'the worst week this year';
    // Site values behind the row, so two sites can be compared from the popover.
    const siteKeys: Partial<Record<NeedKey, AssumptionKey[]>> = {
      'Heated shelter': ['hdd'],
      'Cooled shelter': ['cdd'],
      Water: ['precipIn'],
      Electricity: ['psh', 'windCf'],
    };
    const gs = state.site.growingSeason;
    const seasonDays =
      gs.endDay >= gs.startDay ? gs.endDay - gs.startDay + 1 : 365 - gs.startDay + 1 + gs.endDay;
    const refs = { days, fromDay: from, toDay: to };
    const cov: '✓' | '✗' | 'n/a' = r.needed <= 0 ? 'n/a' : r.pct >= 1 - 1e-9 ? '✓' : '✗';
    return {
      need: r.need,
      unit: UNITS[r.need],
      provided: explained(
        r.provided,
        `average weekly output of resources feeding ${r.need} over ${label} (time mode)`,
        {
          refs,
        },
      ),
      needed: explained(r.needed, `average weekly requests for resources feeding ${r.need} over ${label}`, {
        refs,
      }),
      pct: explained(r.needed > 0 ? r.pct : 0, 'delivered ÷ needed (what consumers actually received)', {
        refs: {
          delivered: r.delivered,
          needed: r.needed,
          ...refs,
          ...(r.need === 'Food' || r.need === 'Water' ? { growingSeasonDays: seasonDays } : {}),
        },
        notes,
        ...(siteKeys[r.need] ? { assumptions: siteKeys[r.need]! } : {}),
      }),
      covered: cov,
      sparkline: spark[r.need],
    };
  });
  const overall = explained(sum.overallScore, 'average % covered over rows with any need', {
    refs: Object.fromEntries(rows.filter((r) => r.covered !== 'n/a').map((r) => [r.need, r.pct.value])),
  });
  return {
    mode,
    humans: bal.humans.value,
    rows,
    overall,
    summary: summaryText(rows, overall.value, mode),
    range: { from, to },
  };
}
