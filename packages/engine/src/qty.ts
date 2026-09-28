import { evalQtyExpr, type Assumptions, type Flow, type System } from '@homestead/catalog';

/** A flow's quantity per its own period for one system, evaluated like the spreadsheet. */
export function evalQty(flow: Flow, system: System, assumptions: Assumptions): number {
  return evalQtyExpr(flow.qty, system, assumptions);
}
