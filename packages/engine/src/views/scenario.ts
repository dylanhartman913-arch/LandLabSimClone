import { getSite, type AssumptionKey, type Assumptions, type Catalog, type NeedKey } from '@homestead/catalog';
import type { BalanceResult, ChecklistRow } from '../balance/balance.ts';
import { balanceFeasible } from '../balance/feasible.ts';
import { getSystem } from '../catalog-index.ts';
import type { Design, DesignFile } from '../design.ts';
import { explained, type Explained } from '../provenance.ts';
import { gameFromDesign } from '../scenario.ts';
import { designForGame } from './hud.ts';
import { siteAssumptions } from './site.ts';

export const ASSUMPTION_LABELS: Record<AssumptionKey, string> = {
  hdd: 'Heating degree-days',
  cdd: 'Cooling degree-days',
  psh: 'Peak sun hours',
  pvDerate: 'PV derate',
  precipIn: 'Annual precipitation',
  galPerSqftIn: 'Gallons per sq ft per inch',
  windCf: 'Wind capacity factor',
  hydroCf: 'Micro-hydro capacity factor',
  seasonsPerYear: 'Growing seasons per year',
};

/** A design file's balance-mode inputs on a site: counts plus the spatial effects of its layout. */
export function designForBalance(
  catalog: Catalog,
  file: DesignFile,
  siteId?: string,
): { design: Design; assumptions: Assumptions } {
  const game = gameFromDesign(catalog, file, { siteId, seed: 1, weatherMode: 'average' });
  return { design: designForGame(game, catalog), assumptions: siteAssumptions(game.site) };
}

export interface ScenarioSummary {
  name: string;
  siteId: string;
  siteName: string;
  /** Average-year ("80%") checklist, straight from balance mode. */
  checklist: ChecklistRow[];
  overall: Explained;
  cost: { buy: Explained; cheapest: Explained };
  labor: { required: Explained; available: Explained };
  land: { used: Explained; available: Explained };
  /** Days of stored water and battery power at the design's use rate. */
  autonomy: { water: Explained; battery: Explained };
  /** Money in minus money out, per year. */
  cashPerYear: Explained;
}

/** Everything the scenario view compares, for one design on one site. */
export function scenarioSummary(catalog: Catalog, file: DesignFile, siteId?: string): ScenarioSummary {
  const site = getSite(siteId ?? file.site ?? 'front-range');
  const { design, assumptions } = designForBalance(catalog, file, site.id);
  const b = balanceFeasible(catalog, assumptions, design);
  const net = b.summary.capitalNet;
  return {
    name: file.name,
    siteId: site.id,
    siteName: site.name,
    checklist: b.checklist,
    overall: b.overallScore,
    cost: { buy: b.summary.costBuy, cheapest: b.summary.costCheapest },
    labor: { required: b.summary.laborRequired, available: b.summary.laborAvailable },
    land: { used: b.summary.landUsed, available: b.summary.landAvailable },
    autonomy: { water: b.summary.waterDays, battery: b.summary.batteryDays },
    cashPerYear: explained(net.value * 52, 'capital net ($/week) × 52', {
      refs: { capitalNetWeekly: net.value },
      terms: net.explain.terms,
    }),
  };
}

export interface TornadoBar {
  key: AssumptionKey;
  label: string;
  base: number;
  /** Overall score with this assumption at −20% and +20%. */
  low: number;
  high: number;
  /** |high − low|. */
  swing: number;
}

export interface FlowEffect {
  flowId: string;
  systemId: string;
  system: string;
  resource: string;
  /** Whether the flow adds to what the row provides or to what it needs. */
  side: 'provides' | 'needs';
  /** The flow's weekly contribution to the row, in the row's unit. */
  weekly: number;
  /** The row's coverage with this flow at −20% and +20%. */
  low: number;
  high: number;
  swing: number;
}

export interface Sensitivity {
  delta: number;
  baseScore: number;
  /** Assumptions, largest swing first. */
  bars: TornadoBar[];
  /**
   * The lowest-covered row the design provides something for (else the lowest-covered row
   * that anything needs; null when every row is fully covered).
   */
  weakest: { need: NeedKey; pct: number } | null;
  /** The ten flows whose ±delta moves the weakest row most. */
  flows: FlowEffect[];
}

/**
 * How much the overall score moves when each site assumption is ±delta (tornado), and
 * which flows matter most to the design's weakest row. Balance mode throughout.
 */
export function sensitivity(
  catalog: Catalog,
  assumptions: Assumptions,
  design: Design,
  delta = 0.2,
): Sensitivity {
  const base: BalanceResult = balanceFeasible(catalog, assumptions, design);
  const bars: TornadoBar[] = (Object.keys(ASSUMPTION_LABELS) as AssumptionKey[]).map((key) => {
    const at = (f: number) =>
      balanceFeasible(catalog, { ...assumptions, [key]: assumptions[key] * f }, design).overallScore.value;
    const low = at(1 - delta);
    const high = at(1 + delta);
    return { key, label: ASSUMPTION_LABELS[key], base: base.overallScore.value, low, high, swing: Math.abs(high - low) };
  });
  bars.sort((a, b) => b.swing - a.swing || a.key.localeCompare(b.key));

  // The weakest row the design makes something for (a row nothing provides has no flows to tune).
  const needed = base.checklist.filter((r) => r.needed.value > 1e-9 && r.pct.value < 1 - 1e-9);
  const byPct = (a: ChecklistRow, b: ChecklistRow) => a.pct.value - b.pct.value || a.need.localeCompare(b.need);
  const weakestRow =
    [...needed].filter((r) => r.provided.value > 1e-9).sort(byPct)[0] ?? [...needed].sort(byPct)[0];
  let flows: FlowEffect[] = [];
  if (weakestRow) {
    const P = weakestRow.provided.value;
    const N = weakestRow.needed.value;
    const pct = (p: number, n: number) => (n > 1e-12 ? Math.min(1, Math.max(0, p / n)) : 0);
    const effects = (side: 'provides' | 'needs', terms: typeof weakestRow.provided.explain.terms) =>
      terms
        .filter((t) => Math.abs(t.value) > 1e-12)
        .map((t) => {
          const d = t.value * delta;
          const low = side === 'provides' ? pct(P - d, N) : pct(P, N - d);
          const high = side === 'provides' ? pct(P + d, N) : pct(P, N + d);
          const flow = catalog.flows.find((f) => f.id === t.flowId);
          return {
            flowId: t.flowId,
            systemId: t.systemId,
            system: getSystem(catalog, t.systemId).name,
            resource: flow?.resource ?? '',
            side,
            weekly: t.value,
            low,
            high,
            swing: Math.abs(high - low),
          };
        });
    flows = [
      ...effects('provides', weakestRow.provided.explain.terms),
      ...effects('needs', weakestRow.needed.explain.terms),
    ]
      .sort((a, b) => b.swing - a.swing || b.weekly - a.weekly || a.flowId.localeCompare(b.flowId))
      .slice(0, 10);
  }
  return {
    delta,
    baseScore: base.overallScore.value,
    bars,
    weakest: weakestRow ? { need: weakestRow.need, pct: weakestRow.pct.value } : null,
    flows,
  };
}
