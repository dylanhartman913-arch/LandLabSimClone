import { NEED_KEYS, type AssumptionKey, type Catalog, type NeedKey } from '@homestead/catalog';
import type { BlockedSystem } from '../balance/balance.ts';
import { statusText, type FeasibleResult } from '../balance/feasible.ts';
import { getSystem } from '../catalog-index.ts';
import { computeSpatial } from '../time/spatial.ts';
import { shelterHeatNeedNotes } from './people.ts';
import { NODE_LABEL } from '../time/gather.ts';
import { explained, type Explained } from '../provenance.ts';
import { summarizeLedgers } from '../time/summarize.ts';
import type { DayLedger, GameState } from '../time/types.ts';
import { monthOfDay } from '../time/calendar.ts';
import { designBalance, seasonOf } from './hud.ts';

export type ChecklistMode = 'current' | 'average' | 'completed' | 'season' | 'worst';

export interface ChecklistRowView {
  need: NeedKey;
  access?: boolean;
  unit: string;
  /** Actual: what feeding systems delivered once supply chains are taken into account (G11). */
  provided: Explained;
  /** Potential: the same with every input met. Shown beside actual as the ceiling, never scored. */
  potential: Explained;
  needed: Explained;
  /** Actual ÷ needed. */
  pct: Explained;
  covered: '✓' | '✗' | 'n/a';
  /** Systems feeding this row that run below full (or whose output doesn't reach a shelter). */
  blocked: BlockedSystem[];
  /** Share of this row's supply the homestead made itself, not bought (G12). */
  selfReliance: Explained;
  /** Weekly coverage (delivered ÷ needed) for up to the last 52 weeks, oldest first. */
  sparkline: number[];
}

export interface ChecklistView {
  mode: ChecklistMode;
  humans: number;
  rows: ChecklistRowView[];
  /** Average actual coverage over rows with any need. */
  overall: Explained;
  /** The same if every input were met (smaller, beside the score). */
  potentialOverall: Explained;
  /** Coverage × share made at home, averaged over rows with any need (labor left out) (G12). */
  selfReliance: Explained;
  /** Plain-language summary of the result. */
  summary: string;
  /** Which days a time-mode view covers. */
  range: { from: number; to: number } | null;
  /**
   * LL-45: hot water is a comfort need (it drifts wellbeing) but not a scored checklist row, as in the
   * workbook. Measured views report its share met, outside every score. Null when nobody asked for any.
   */
  hotWater?: { pct: Explained; needed: Explained } | null;
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
  const scored = rows.filter((r) => r.covered !== 'n/a' && !r.access);
  const met = scored.filter((r) => r.covered === '✓').map((r) => r.need);
  const worst = [...scored]
    .sort((a, b) => a.pct.value - b.pct.value)
    .slice(0, 2)
    .filter((r) => r.pct.value < 1);
  const when =
    mode === 'average'
      ? 'Assuming all planned systems are complete and mature, in an average year'
      : mode === 'completed'
        ? 'Forecasting completed systems at maturity, in an average year'
        : mode === 'current'
          ? 'Over the last 7 measured days'
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
 * Explicit planned/completed annual forecasts, or measured current/season/worst-week ledgers.
 * An empty measured window never falls back to a design forecast.
 * Potential (every input met) is shown beside actual as the ceiling.
 */
export function checklistView(
  state: GameState,
  catalog: Catalog,
  mode: ChecklistMode,
  bal: FeasibleResult = designBalance(state, catalog),
): ChecklistView {
  const spark = sparklines(state.ledgers);
  if (mode === 'average' || mode === 'completed') {
    if (mode === 'completed') bal = designBalance(state, catalog, 'completed');
    // What lowers a shelter's heat need (blankets, a retrofit) is named on the heat row's why (G16).
    const heatNotes = shelterHeatNeedNotes(state, catalog).map((n) => `Heat needed: ${n}`);
    const withHeat = (e: Explained, need: string): Explained =>
      need === 'Heated shelter' && heatNotes.length ? { ...e, explain: { ...e.explain, notes: [...(e.explain.notes ?? []), ...heatNotes] } } : e;
    const rows: ChecklistRowView[] = bal.checklist.map((r) => ({
      need: r.need,
      ...(state.settings.transportAccess && r.need === 'Transportation' ? { access: true } : {}),
      unit: r.unit,
      provided: r.provided,
      potential: r.potential!,
      needed: withHeat(r.needed, r.need),
      pct: withHeat(r.pct, r.need),
      covered: r.covered,
      blocked: r.blocked ?? [],
      selfReliance: r.selfReliance ?? explained(0, 'not computed'),
      sparkline: spark[r.need],
    }));
    return {
      mode,
      humans: bal.humans.value,
      rows,
      overall: bal.overallScore,
      potentialOverall: bal.potential.overallScore,
      selfReliance: bal.selfReliance,
      summary: summaryText(rows, bal.overallScore.value, mode),
      range: null,
    };
  }

  const year = state.calendar.year;
  let ledgers: DayLedger[];
  if (mode === 'current' || state.ledgers.length === 0) {
    ledgers = state.ledgers.slice(-7);
  } else if (mode === 'season') {
    const key = (day: number, year: number) => {
      const season = seasonOf(day);
      return `${year - (season === 'winter' && monthOfDay(day) < 2 ? 1 : 0)}-${season}`;
    };
    const season = key(state.calendar.day, year);
    ledgers = state.ledgers.filter((l) => key(l.day, l.year) === season);
  } else {
    const thisYear = state.ledgers.filter((l) => l.year === year);
    ledgers = thisYear;
  }
  let window = ledgers;
  if (mode === 'worst' && ledgers.length >= 7) {
    // The 7-day window with the lowest average coverage across rows that need anything.
    let bestI = 0;
    let bestScore = Infinity;
    for (let i = 0; i + 7 <= ledgers.length; i++) {
      const s = summarizeLedgers(ledgers.slice(i, i + 7), catalog, state.settings.transportAccess).overallScore;
      if (s < bestScore) {
        bestScore = s;
        bestI = i;
      }
    }
    window = ledgers.slice(bestI, bestI + 7);
  }
  const sum = summarizeLedgers(window, catalog, state.settings.transportAccess);
  const measuredAccess = state.settings.transportAccess || window.some((l) => l.access !== undefined);
  const from = window[0]?.absDay ?? state.calendar.absDay;
  const to = window.at(-1)?.absDay ?? state.calendar.absDay;
  const days = window.length;
  const curtailed = new Map<string, Set<string>>();
  // Average satisfaction of each system over the window (days it ran fully count as 1).
  const satSum = new Map<string, { sum: number; limitedBy: Map<string, number>; count: number }>();
  for (const l of window) {
    for (const c of l.curtailed) {
      const e = satSum.get(c.systemId) ?? { sum: 0, limitedBy: new Map<string, number>(), count: c.count };
      e.sum += 1 - c.sat;
      if (c.limitedBy) e.limitedBy.set(c.limitedBy, (e.limitedBy.get(c.limitedBy) ?? 0) + 1);
      satSum.set(c.systemId, e);
      if (!c.limitedBy) continue;
      const set = curtailed.get(c.limitedBy) ?? new Set<string>();
      set.add(c.systemId);
      curtailed.set(c.limitedBy, set);
    }
  }
  const spatial = computeSpatial(catalog, state);
  const undelivered = new Map<string, Set<string>>(); // systemId → resources
  for (const inst of state.instances) {
    for (const r of Object.keys(spatial.get(inst.id)?.undelivered ?? {})) {
      const set = undelivered.get(inst.systemId) ?? new Set<string>();
      set.add(r);
      undelivered.set(inst.systemId, set);
    }
  }
  const producers = new Map<string, Set<string>>(); // resource → systems in the design making it
  for (const inst of state.instances) {
    for (const f of catalog.flows) {
      if (f.systemId !== inst.systemId || f.direction !== 'out') continue;
      const set = producers.get(f.resource) ?? new Set<string>();
      set.add(inst.systemId);
      producers.set(f.resource, set);
    }
  }
  const blockedFor = (need: NeedKey): BlockedSystem[] => {
    const out: BlockedSystem[] = [];
    const seen = new Set<string>();
    for (const res of feeding(need)) {
      for (const id of producers.get(res) ?? []) {
        if (seen.has(id)) continue;
        const e = satSum.get(id);
        const count = state.instances.filter((i) => i.systemId === id).length;
        if (e && e.sum > 1e-9) {
          seen.add(id);
          const sat = 1 - e.sum / days;
          const limitedBy = [...e.limitedBy].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
          out.push({ systemId: id, name: getSystem(catalog, id).name, count, satisfaction: sat, limitedBy, status: statusText(sat, limitedBy) });
        } else if (undelivered.get(id)?.has(res)) {
          seen.add(id);
          const sys = getSystem(catalog, id);
          out.push({
            systemId: id,
            name: sys.name,
            count,
            satisfaction: 0,
            limitedBy: null,
            status: sys.outdoor
              ? `outdoors: its ${res.toLowerCase()} doesn't reach a shelter`
              : `not near a shelter: its ${res.toLowerCase()} is lost`,
          });
        }
      }
    }
    return out.sort((a, b) => a.satisfaction - b.satisfaction || a.name.localeCompare(b.name));
  };
  const feeding = (need: NeedKey) => catalog.resources.filter((r) => r.needsRow === need).map((r) => r.name);
  // Gathering (G14): what came from the land, with the labor it took, for the "why" popovers.
  const fmt = (x: number) => (x >= 100 ? Math.round(x).toLocaleString('en-US') : x.toFixed(x >= 10 ? 0 : 1));
  const gatherNotes = (need: NeedKey): string[] => {
    const out: string[] = [];
    const byRes = new Map<string, Map<string, { amount: number; hours: number }>>();
    let waterGal = 0;
    let waterHours = 0;
    const waterFrom = new Map<string, number>();
    for (const l of window) {
      for (const h of l.gathered ?? []) {
        const m = byRes.get(h.resource) ?? new Map<string, { amount: number; hours: number }>();
        const e = m.get(h.nodeType) ?? { amount: 0, hours: 0 };
        e.amount += h.amount;
        e.hours += h.hours;
        m.set(h.nodeType, e);
        byRes.set(h.resource, m);
        if (h.resource === 'Water') {
          waterGal += h.amount;
          waterHours += h.hours;
          waterFrom.set(h.nodeType, (waterFrom.get(h.nodeType) ?? 0) + h.amount);
        }
      }
    }
    const label = (t: string) => NODE_LABEL[t as keyof typeof NODE_LABEL]?.toLowerCase() ?? t;
    for (const res of feeding(need)) {
      const unit = catalog.resources.find((x) => x.name === res)?.unit ?? '';
      for (const [type, e] of byRes.get(res) ?? []) {
        out.push(`${res}: ${fmt(e.amount)} ${unit} gathered from the ${label(type)}, ${fmt(e.hours)} h labor (walking included).`);
      }
    }
    if (need === 'Drinking water') {
      let gal = 0;
      let boilHours = 0;
      for (const l of window) {
        gal += l.boiled?.gal ?? 0;
        boilHours += l.boiled?.laborHours ?? 0;
      }
      if (gal > 1e-9) {
        const src = [...waterFrom].sort((a, b) => b[1] - a[1])[0]?.[0];
        const fetch = waterGal > 0 ? (waterHours * gal) / waterGal : 0;
        out.push(`Drinking water: ${fmt(gal)} gal from the ${src ? label(src) : 'land'} via boiling, ${fmt(fetch + boilHours)} h labor.`);
      }
    }
    return out;
  };

  const heatNeed = shelterHeatNeedNotes(state, catalog);
  const rows: ChecklistRowView[] = sum.checklist.map((r) => {
    const notes: string[] = [];
    if (r.need === 'Heated shelter') notes.push(...heatNeed.map((n) => `Heat needed: ${n}`));
    for (const res of feeding(r.need)) {
      const sys = curtailed.get(res);
      if (sys?.size) {
        const names = [...sys].map((id) => catalog.systems.find((x) => x.id === id)?.name ?? id);
        notes.push(`Short on ${res}: curtails ${names.join(', ')}`);
      }
    }
    const label = mode === 'current' ? 'the last 7 measured days' : mode === 'season' ? 'this season' : 'the worst week this year';
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
      ...(measuredAccess && r.need === 'Transportation' ? { access: true } : {}),
      unit: UNITS[r.need],
      provided: explained(
        r.provided,
        measuredAccess && r.need === 'Transportation' ? 'completed access-trip miles, own transport or paid alternatives; weekly equivalent, excluded from household score' : `actual: average weekly output of resources feeding ${r.need} that reached its users over ${label} (time mode)`,
        {
          refs: { ...refs, potential: r.potential },
          notes: gatherNotes(r.need),
        },
      ),
      potential: explained(
        Math.max(r.potential, r.delivered),
        measuredAccess && r.need === 'Transportation' ? 'attempted trip miles if all access were available; weekly equivalent' : `potential: average weekly output of resources feeding ${r.need} over ${label} if every input were met, including at least the measured delivery from stocks`,
        { refs: { ...refs, productionPotential: r.potential, measuredDelivery: r.delivered } },
      ),
      needed: explained(r.needed, measuredAccess && r.need === 'Transportation' ? 'actual attempted trip miles, not a flat resident need; weekly equivalent' : `average weekly requests for resources feeding ${r.need} over ${label}`, {
        refs,
        ...(r.need === 'Heated shelter' && heatNeed.length ? { notes: heatNeed.map((n) => `Heat needed: ${n}`) } : {}),
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
      blocked: blockedFor(r.need),
      selfReliance: explained(r.selfReliance, `1 − bought ÷ provided over ${label}`, {
        refs: { bought: r.bought, provided: r.provided, ...refs },
      }),
      sparkline: spark[r.need],
    };
  });
  const overall = explained(sum.overallScore, 'average % covered over rows with any need', {
    refs: Object.fromEntries(rows.filter((r) => r.covered !== 'n/a' && !r.access).map((r) => [r.need, r.pct.value])),
  });
  const scored = rows.filter((r) => r.needed.value > 0 && !r.access);
  const potentialOverall = explained(
    scored.length ? scored.reduce((a, r) => a + Math.min(1, r.potential.value / r.needed.value), 0) / scored.length : 0,
    'average of min(1, potential ÷ needed) over rows with any need',
  );
  return {
    mode,
    humans: bal.humans.value,
    rows,
    overall,
    potentialOverall,
    selfReliance: explained(sum.selfReliance, 'average over rows with any need (labor left out) of % covered × share made at home', {
      refs: { days, fromDay: from, toDay: to },
    }),
    summary: days ? summaryText(rows, overall.value, mode) : 'No measured days yet. Run the clock to see current operations; forecasts are available separately.',
    range: { from, to },
    hotWater: hotWaterComfort(window, mode === 'current' ? 'the last 7 measured days' : mode === 'season' ? 'this season' : 'the worst week this year'),
  };
}

function hotWaterComfort(window: readonly DayLedger[], label: string): ChecklistView['hotWater'] {
  let requested = 0;
  let unmet = 0;
  for (const l of window) {
    requested += l.resources['Hot water']?.requested ?? 0;
    unmet += l.resources['Hot water']?.unmet ?? 0;
  }
  if (requested <= 1e-9) return null;
  const weeks = window.length / 7;
  return {
    pct: explained(1 - unmet / requested, `hot water delivered ÷ requested over ${label}; a comfort need, not scored`, {
      refs: { requested, unmet },
    }),
    needed: explained(requested / weeks, `average weekly hot water requested over ${label}`),
  };
}
