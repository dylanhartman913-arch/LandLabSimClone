import type { AssumptionKey, QtyExpr } from '../schema.ts';

export interface FormulaContext {
  /** Row number of the flow in the Flows sheet (formulas look up their own system by `$B<row>`). */
  rowNumber: number;
  /** Assumptions cell address (e.g. `C6`) → assumption key. */
  assumptionAt: Record<string, AssumptionKey>;
  /** Column letters on the Systems sheet for the thermal and catchment parameters. */
  systemCols: { name: string; area: string; lossFactor: string; catchment: string; captureEff: string };
}

export type FormulaResult = { ok: true; qty: QtyExpr } | { ok: false; reason: string };

const NUM = '(\\d+(?:\\.\\d+)?)';
const ASSUMPTION = 'Assumptions!\\$C\\$(\\d+)';

function lookup(col: string, nameCol: string): string {
  // INDEX(Systems!$N$2:$N$169,MATCH($B28,Systems!$B$2:$B$169,0))
  return `INDEX\\(Systems!\\$${col}\\$2:\\$${col}\\$\\d+,MATCH\\(\\$${nameCol}(\\d+),Systems!\\$B\\$2:\\$B\\$\\d+,0\\)\\)`;
}

interface Template {
  name: string;
  build(ctx: FormulaContext): RegExp;
  /** Returns the QtyExpr, or a reason the match is not acceptable. */
  interpret(m: RegExpMatchArray, ctx: FormulaContext): QtyExpr | string;
}

function assumption(
  ctx: FormulaContext,
  row: string | undefined,
  expected: AssumptionKey[],
): AssumptionKey | string {
  const key = ctx.assumptionAt[`C${row}`];
  if (!key) return `references Assumptions!C${row}, which is not a known assumption`;
  if (!expected.includes(key))
    return `references ${key} (Assumptions!C${row}); expected ${expected.join(' or ')}`;
  return key;
}

function selfRow(ctx: FormulaContext, ...rows: (string | undefined)[]): string | null {
  for (const r of rows) {
    if (Number(r) !== ctx.rowNumber) return `looks up row $B${r} but lives on row ${ctx.rowNumber}`;
  }
  return null;
}

/**
 * The formula templates the Flows sheet is allowed to use. Every template
 * mirrors a formula the spreadsheet author wrote; anything else fails export.
 */
export const TEMPLATES: Template[] = [
  {
    name: 'sun',
    build: () => new RegExp(`^${ASSUMPTION}\\*7$`),
    interpret: (m, ctx) => {
      const k = assumption(ctx, m[1], ['psh']);
      return k === 'psh' ? { kind: 'sun' } : k;
    },
  },
  {
    name: 'rain',
    build: () => new RegExp(`^${ASSUMPTION}/52$`),
    interpret: (m, ctx) => {
      const k = assumption(ctx, m[1], ['precipIn']);
      return k === 'precipIn' ? { kind: 'rain' } : k;
    },
  },
  {
    name: 'pv',
    build: () => new RegExp(`^${NUM}\\*${ASSUMPTION}\\*7\\*${ASSUMPTION}$`),
    interpret: (m, ctx) => {
      const a = assumption(ctx, m[2], ['psh']);
      if (a !== 'psh') return a;
      const b = assumption(ctx, m[3], ['pvDerate']);
      if (b !== 'pvDerate') return b;
      return { kind: 'pv', kw: Number(m[1]) };
    },
  },
  {
    name: 'wind/hydro',
    build: () => new RegExp(`^${NUM}\\*168\\*${ASSUMPTION}$`),
    interpret: (m, ctx) => {
      const k = assumption(ctx, m[2], ['windCf', 'hydroCf']);
      if (k === 'windCf') return { kind: 'wind', kw: Number(m[1]) };
      if (k === 'hydroCf') return { kind: 'hydro', kw: Number(m[1]) };
      return k;
    },
  },
  {
    name: 'heatLoad/coolLoad',
    build: (ctx) =>
      new RegExp(
        `^${lookup(ctx.systemCols.area, 'B')}\\*${lookup(ctx.systemCols.lossFactor, 'B')}\\*${ASSUMPTION}\\*24/52$`,
      ),
    interpret: (m, ctx) => {
      const bad = selfRow(ctx, m[1], m[2]);
      if (bad) return bad;
      const k = assumption(ctx, m[3], ['hdd', 'cdd']);
      if (k === 'hdd') return { kind: 'heatLoad' };
      if (k === 'cdd') return { kind: 'coolLoad' };
      return k;
    },
  },
  {
    name: 'catchArea',
    build: (ctx) => new RegExp(`^${lookup(ctx.systemCols.catchment, 'B')}$`),
    interpret: (m, ctx) => selfRow(ctx, m[1]) ?? { kind: 'catchArea' },
  },
  {
    name: 'rainCapture',
    build: (ctx) =>
      new RegExp(
        `^${lookup(ctx.systemCols.catchment, 'B')}\\*${ASSUMPTION}/52\\*${ASSUMPTION}\\*${lookup(ctx.systemCols.captureEff, 'B')}$`,
      ),
    interpret: (m, ctx) => {
      const bad = selfRow(ctx, m[1], m[4]);
      if (bad) return bad;
      const a = assumption(ctx, m[2], ['precipIn']);
      if (a !== 'precipIn') return a;
      const b = assumption(ctx, m[3], ['galPerSqftIn']);
      if (b !== 'galPerSqftIn') return b;
      return { kind: 'rainCapture' };
    },
  },
];

/** Map a Flows!E formula to a QtyExpr. Never falls back to the cached value. */
export function recognizeFormula(formula: string, ctx: FormulaContext): FormulaResult {
  const f = formula.replace(/^=/, '').replace(/\s+/g, '');
  for (const t of TEMPLATES) {
    const m = f.match(t.build(ctx));
    if (!m) continue;
    const out = t.interpret(m, ctx);
    if (typeof out === 'string') return { ok: false, reason: `matches the ${t.name} template but ${out}` };
    return { ok: true, qty: out };
  }
  return { ok: false, reason: 'does not match any known formula template' };
}
