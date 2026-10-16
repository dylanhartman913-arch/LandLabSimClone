import type { AssumptionKey, Period } from '@homestead/catalog';

/** One catalog flow's contribution to a number. */
export interface Term {
  flowId: string;
  systemId: string;
  /** How many of the system (instances, or the balance-mode count). */
  count: number;
  /** Quantity per period for one system, from `evalQty`. */
  qty: number;
  period: Period;
  /** Weekly factor for the period (e.g. Daily = 365/52). */
  factor: number;
  /** Unit conversion into the row's unit (checklist rows only, e.g. 70 kcal per egg). */
  needFactor?: number;
  /** Spatial adjustment (shade, slope, neighbors) applied to this flow, if any. */
  adjust?: number;
  /** Feasible balance: the system's satisfaction × boosts (1 = running fully). */
  satisfaction?: number;
  /** Feasible balance: share of this heat or cooling that reaches a shelter. */
  delivered?: number;
  /** qty × factor × count (× adjust) (× needFactor) (× satisfaction × delivered). */
  value: number;
}

/** How a number was computed. Built while computing, never reconstructed afterwards. */
export interface Explain {
  /** Plain-language formula, e.g. "Σ output flows × count × weekly factor". */
  formula: string;
  /** Flow-level contributions, in catalog order. */
  terms: Term[];
  /** Named intermediate values the formula refers to (e.g. provided, needed). */
  refs?: Record<string, number>;
  /** Site assumptions this number depends on. */
  assumptions?: AssumptionKey[];
  /** Free-text notes (e.g. "capped at 100%"). */
  notes?: string[];
}

export interface Explained {
  value: number;
  explain: Explain;
}

export function explained(value: number, formula: string, extra: Partial<Explain> = {}): Explained {
  return { value, explain: { formula, terms: extra.terms ?? [], ...extra } };
}
