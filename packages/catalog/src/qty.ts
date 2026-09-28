import type { Assumptions, QtyExpr } from './schema.ts';

/** The system parameters a QtyExpr may read. */
export interface QtySystemParams {
  conditionedAreaSqft?: number | undefined;
  heatLossFactor?: number | undefined;
  catchmentSqft?: number | undefined;
  captureEff?: number | undefined;
}

/**
 * Evaluate a flow quantity (per the flow's own period) exactly as the
 * spreadsheet does. Operation order mirrors the Excel formulas left to right
 * so results agree bit-for-bit in the common case.
 */
export function evalQtyExpr(qty: QtyExpr, sys: QtySystemParams, a: Assumptions): number {
  switch (qty.kind) {
    case 'const':
      return qty.value;
    case 'sun':
      return a.psh * 7;
    case 'rain':
      return a.precipIn / 52;
    case 'pv':
      return qty.kw * a.psh * 7 * a.pvDerate;
    case 'wind':
      return qty.kw * 168 * a.windCf;
    case 'hydro':
      return qty.kw * 168 * a.hydroCf;
    case 'catchArea':
      return sys.catchmentSqft ?? 0;
    case 'rainCapture':
      return (((sys.catchmentSqft ?? 0) * a.precipIn) / 52) * a.galPerSqftIn * (sys.captureEff ?? 0);
    case 'heatLoad':
      return ((sys.conditionedAreaSqft ?? 0) * (sys.heatLossFactor ?? 0) * a.hdd * 24) / 52;
    case 'coolLoad':
      return ((sys.conditionedAreaSqft ?? 0) * (sys.heatLossFactor ?? 0) * a.cdd * 24) / 52;
  }
}

/** A plain-language formula for a QtyExpr, used by provenance ("why" popovers). */
export function describeQtyExpr(qty: QtyExpr): string {
  switch (qty.kind) {
    case 'const':
      return `${qty.value} (typed estimate)`;
    case 'sun':
      return 'peak sun hours × 7';
    case 'rain':
      return 'annual precipitation ÷ 52';
    case 'pv':
      return `${qty.kw} kW × peak sun hours × 7 × PV derate`;
    case 'wind':
      return `${qty.kw} kW × 168 h × wind capacity factor`;
    case 'hydro':
      return `${qty.kw} kW × 168 h × micro-hydro capacity factor`;
    case 'catchArea':
      return 'catchment area';
    case 'rainCapture':
      return 'catchment area × precipitation ÷ 52 × 0.623 gal/(sq ft·in) × capture efficiency';
    case 'heatLoad':
      return 'conditioned area × heat-loss factor × heating degree-days × 24 ÷ 52';
    case 'coolLoad':
      return 'conditioned area × heat-loss factor × cooling degree-days × 24 ÷ 52';
  }
}

/** Which assumptions a QtyExpr reads (for provenance and sensitivity analysis). */
export function qtyAssumptionKeys(qty: QtyExpr): (keyof Assumptions)[] {
  switch (qty.kind) {
    case 'const':
    case 'catchArea':
      return [];
    case 'sun':
      return ['psh'];
    case 'rain':
      return ['precipIn'];
    case 'pv':
      return ['psh', 'pvDerate'];
    case 'wind':
      return ['windCf'];
    case 'hydro':
      return ['hydroCf'];
    case 'rainCapture':
      return ['precipIn', 'galPerSqftIn'];
    case 'heatLoad':
      return ['hdd'];
    case 'coolLoad':
      return ['cdd'];
  }
}
