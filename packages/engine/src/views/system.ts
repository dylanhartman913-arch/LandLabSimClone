import {
  describeQtyExpr,
  qtyAssumptionKeys,
  type Assumptions,
  type Catalog,
  type Flow,
} from '@homestead/catalog';
import { getSystem, indexCatalog } from '../catalog-index.ts';
import { weeklyFactor } from '../periods.ts';
import { explained, type Explained } from '../provenance.ts';
import { evalQty } from '../qty.ts';

export interface FlowView {
  flow: Flow;
  resource: string;
  unit: string;
  /** Quantity per the flow's own period, for one system. */
  qty: Explained;
  /** Weekly equivalent for one system. */
  weekly: Explained;
  periodLabel: string;
}

const PERIOD_LABEL: Record<Flow['period'], string> = {
  Daily: 'daily',
  Weekly: 'weekly',
  Monthly: 'monthly',
  'Per season': 'per season',
  Yearly: 'yearly',
  'One-time': 'one time',
  Capacity: 'capacity',
};

/** A system's inputs and outputs with evaluated quantities, each with provenance. */
export function systemFlows(catalog: Catalog, systemId: string, assumptions: Assumptions) {
  const idx = indexCatalog(catalog);
  const sys = getSystem(catalog, systemId);
  const view = (f: Flow): FlowView => {
    const q = evalQty(f, sys, assumptions);
    const factor = weeklyFactor(catalog, f.period, assumptions);
    const keys = qtyAssumptionKeys(f.qty);
    return {
      flow: f,
      resource: f.resource,
      unit: idx.resourceByName.get(f.resource)!.unit,
      qty: explained(q, describeQtyExpr(f.qty), {
        terms: [{ flowId: f.id, systemId, count: 1, qty: q, period: f.period, factor: 1, value: q }],
        ...(keys.length ? { assumptions: keys } : {}),
      }),
      weekly: explained(q * factor, 'qty × weekly factor', { refs: { qty: q, factor } }),
      periodLabel: PERIOD_LABEL[f.period],
    };
  };
  const flows = idx.flowsBySystem.get(systemId) ?? [];
  const inputs = flows.filter((f) => f.direction === 'in').map(view);
  const outputs = flows.filter((f) => f.direction === 'out').map(view);
  /** The two largest recurring outputs by weekly amount (for tooltips). */
  const topOutputs = outputs
    .filter((o) => o.flow.period !== 'Capacity' && o.weekly.value > 0)
    .sort((a, b) => b.weekly.value - a.weekly.value)
    .concat(outputs.filter((o) => o.flow.period === 'Capacity'))
    .slice(0, 2);
  return { system: sys, inputs, outputs, topOutputs };
}
