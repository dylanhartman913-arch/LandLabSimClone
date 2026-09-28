import {
  evalQtyExpr,
  NEED_KEYS,
  qtyAssumptionKeys,
  type AssumptionKey,
  type Assumptions,
  type Catalog,
  type Flow,
  type NeedKey,
  type System,
} from '@homestead/catalog';
import { indexCatalog } from '../catalog-index.ts';
import type { Design } from '../design.ts';
import { explained, type Explained, type Term } from '../provenance.ts';
import { weeklyFactors } from '../periods.ts';

export type ResourceStatus = 'Site-supplied' | 'Not in design' | 'Deficit' | 'Surplus' | 'Balanced';

export interface ResourceBalance {
  resource: string;
  unit: string;
  produced: Explained;
  consumed: Explained;
  net: Explained;
  status: ResourceStatus;
}

export interface ChecklistRow {
  need: NeedKey;
  unit: string;
  /** Σ output flows feeding this row, converted into the row unit, per week. */
  provided: Explained;
  /** Σ input flows feeding this row (people, animals, gardens, shelters), per week. */
  needed: Explained;
  /** min(1, provided ÷ needed); 0 when nothing is needed. */
  pct: Explained;
  covered: '✓' | '✗' | 'n/a';
  /** Resources that feed this row. */
  resources: string[];
}

export const SUMMARY_KEYS = [
  'humans',
  'systemsPlaced',
  'overallScore',
  'costBuy',
  'costCheapest',
  'setupLaborHrs',
  'laborAvailable',
  'laborRequired',
  'landAvailable',
  'landUsed',
  'landUsedPct',
  'waterStorage',
  'waterDays',
  'batteryStorage',
  'batteryDays',
  'foodStorage',
  'capitalIn',
  'capitalOut',
  'capitalNet',
  'wellbeing',
  'deficitCount',
] as const;
export type SummaryKey = (typeof SUMMARY_KEYS)[number];

export interface BalanceResult {
  humans: Explained;
  checklist: ChecklistRow[];
  overallScore: Explained;
  resources: Record<string, ResourceBalance>;
  summary: Record<SummaryKey, Explained>;
}

const CHECKLIST_UNITS: Record<NeedKey, string> = {
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

function sum(terms: Term[]): number {
  let s = 0;
  for (const t of terms) s += t.value;
  return s;
}

function status(cls: string, produced: number, consumed: number, net: number): ResourceStatus {
  if (cls === 'Ambient') return 'Site-supplied';
  if (produced === 0 && consumed === 0) return 'Not in design';
  if (net < -0.0001 * Math.max(consumed, 1)) return 'Deficit';
  if (net > 0.0001 * Math.max(produced, 1)) return 'Surplus';
  return 'Balanced';
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

interface FlowStatic {
  flow: Flow;
  sys: System;
  out: boolean;
  needsRow: NeedKey | undefined;
  needFactor: number;
  assumptionKeys: AssumptionKey[];
}

interface BalanceStatics {
  feeding: Map<NeedKey, string[]>;
  producedFormula: Map<string, string>;
  consumedFormula: Map<string, string>;
  /** Flows grouped by system, in catalog order. */
  flowsBySystem: Map<string, FlowStatic[]>;
  /** True when flows are listed system by system in Systems order, so walking systems keeps row order. */
  systemContiguous: boolean;
  flowOrder: Map<string, number>;
  /** Shared, frozen results for resources nothing in the design touches. */
  unused: Map<string, ResourceBalance>;
}

const statics = new WeakMap<Catalog, BalanceStatics>();

function getStatics(catalog: Catalog): BalanceStatics {
  const hit = statics.get(catalog);
  if (hit) return hit;
  const feeding = new Map<NeedKey, string[]>();
  for (const k of NEED_KEYS)
    feeding.set(
      k,
      catalog.resources.filter((r) => r.needsRow === k).map((r) => r.name),
    );
  const producedFormula = new Map<string, string>();
  const consumedFormula = new Map<string, string>();
  for (const r of catalog.resources) {
    producedFormula.set(r.name, `Σ output flows of ${r.name} × count × weekly factor (${r.unit}/week)`);
    consumedFormula.set(r.name, `Σ input flows of ${r.name} × count × weekly factor (${r.unit}/week)`);
  }
  const sysById = new Map(catalog.systems.map((x) => [x.id, x]));
  const resByName = new Map(catalog.resources.map((x) => [x.name, x]));
  const flowsBySystem = new Map<string, FlowStatic[]>(catalog.systems.map((x) => [x.id, []]));
  for (const flow of catalog.flows) {
    const res = resByName.get(flow.resource)!;
    flowsBySystem.get(flow.systemId)!.push({
      flow,
      sys: sysById.get(flow.systemId)!,
      out: flow.direction === 'out',
      needsRow: res.needsRow,
      needFactor: res.factorToNeed ?? 1,
      assumptionKeys: qtyAssumptionKeys(flow.qty),
    });
  }
  const sysPos = new Map(catalog.systems.map((x, i) => [x.id, i]));
  let systemContiguous = true;
  for (let i = 1; i < catalog.flows.length; i++) {
    if (sysPos.get(catalog.flows[i]!.systemId)! < sysPos.get(catalog.flows[i - 1]!.systemId)!)
      systemContiguous = false;
  }
  const flowOrder = new Map(catalog.flows.map((f, i) => [f.id, i]));
  const unused = new Map<string, ResourceBalance>();
  for (const r of catalog.resources) {
    const zero = (formula: string) =>
      Object.freeze(explained(0, formula, { terms: Object.freeze([]) as unknown as Term[] }));
    unused.set(
      r.name,
      Object.freeze({
        resource: r.name,
        unit: r.unit,
        produced: zero(producedFormula.get(r.name)!),
        consumed: zero(consumedFormula.get(r.name)!),
        net: zero('produced − consumed'),
        status: status(r.class, 0, 0, 0),
      }),
    );
  }
  const out = {
    feeding,
    producedFormula,
    consumedFormula,
    flowsBySystem,
    systemContiguous,
    flowOrder,
    unused,
  };
  statics.set(catalog, out);
  return out;
}

/**
 * Balance mode: the spreadsheet's math. Weekly averages × counts, the Needs
 * Checklist, the overall score, and the Design Summary, each with provenance.
 */
export function balance(catalog: Catalog, assumptions: Assumptions, design: Design): BalanceResult {
  const idx = indexCatalog(catalog);
  const st = getStatics(catalog);
  const factors = weeklyFactors(catalog, assumptions);
  const counts = design.counts;

  const outTerms = new Map<string, Term[]>();
  const inTerms = new Map<string, Term[]>();
  const needOut = new Map<NeedKey, Term[]>();
  const needIn = new Map<NeedKey, Term[]>();
  const assumptionsByResource = new Map<string, Set<AssumptionKey>>();
  const adjustNotes = new Map<string, Set<string>>();
  for (const k of NEED_KEYS) {
    needOut.set(k, []);
    needIn.set(k, []);
  }

  // Walk flows in spreadsheet row order (system by system) so sums match SUMIFS order.
  for (const sys of catalog.systems) {
    const count = counts[sys.id] ?? 0;
    if (count === 0) continue;
    for (const fs of st.flowsBySystem.get(sys.id)!) {
      const flow = fs.flow;
      const qty = evalQtyExpr(flow.qty, sys, assumptions);
      const factor = factors[flow.period];
      let weekly = qty * factor * count; // (E × weekly factor) × count, as Flows!H then J
      const term: Term = {
        flowId: flow.id,
        systemId: sys.id,
        count,
        qty,
        period: flow.period,
        factor,
        value: weekly,
      };
      const adj = design.adjust?.[sys.id]?.[fs.out ? 'out' : 'in']?.[flow.resource];
      if (adj && adj.factor !== 1) {
        // Spatial adjustment (G7): shade, slope, or neighbors change this flow.
        weekly *= adj.factor;
        term.adjust = adj.factor;
        term.value = weekly;
        let set = adjustNotes.get(flow.resource);
        if (!set) adjustNotes.set(flow.resource, (set = new Set<string>()));
        for (const n of adj.notes) set.add(n);
      }
      const bucket = fs.out ? outTerms : inTerms;
      const list = bucket.get(flow.resource);
      if (list) list.push(term);
      else bucket.set(flow.resource, [term]);
      if (fs.assumptionKeys.length) {
        let set = assumptionsByResource.get(flow.resource);
        if (!set) assumptionsByResource.set(flow.resource, (set = new Set<AssumptionKey>()));
        for (const k of fs.assumptionKeys) set.add(k);
      }
      if (fs.needsRow) {
        const needTerm: Term = { ...term, needFactor: fs.needFactor, value: weekly * fs.needFactor };
        (fs.out ? needOut : needIn).get(fs.needsRow)!.push(needTerm);
      }
    }
  }
  if (!st.systemContiguous) {
    const byRow = (a: Term, b: Term) => st.flowOrder.get(a.flowId)! - st.flowOrder.get(b.flowId)!;
    for (const m of [outTerms, inTerms, needOut, needIn] as Map<string, Term[]>[])
      for (const t of m.values()) t.sort(byRow);
  }

  // Resources balance (Resources!I:L)
  const resources: Record<string, ResourceBalance> = {};
  for (const r of catalog.resources) {
    const o = outTerms.get(r.name);
    const i = inTerms.get(r.name);
    if (!o && !i) {
      resources[r.name] = st.unused.get(r.name)!;
      continue;
    }
    const produced = o ? sum(o) : 0;
    const consumed = i ? sum(i) : 0;
    const net = produced - consumed;
    const assumptionKeys = [...(assumptionsByResource.get(r.name) ?? [])];
    const rn = adjustNotes.get(r.name);
    const extra = {
      ...(assumptionKeys.length ? { assumptions: assumptionKeys } : {}),
      ...(rn ? { notes: [...rn] } : {}),
    };
    resources[r.name] = {
      resource: r.name,
      unit: r.unit,
      produced: explained(produced, st.producedFormula.get(r.name)!, { terms: o ?? [], ...extra }),
      consumed: explained(consumed, st.consumedFormula.get(r.name)!, { terms: i ?? [], ...extra }),
      net: explained(net, 'produced − consumed', { refs: { produced, consumed } }),
      status: status(r.class, produced, consumed, net),
    };
  }

  // Needs Checklist
  const humanSys = idx.systemByName.get('Human Being');
  const humansN = humanSys ? (counts[humanSys.id] ?? 0) : 0;
  const humans = explained(humansN, 'count of Human Being');
  const checklist: ChecklistRow[] = NEED_KEYS.map((need) => {
    const o = needOut.get(need)!;
    const i = needIn.get(need)!;
    const p = sum(o);
    const n = sum(i);
    const pct = n === 0 ? 0 : Math.min(1, p / n);
    const feeding = st.feeding.get(need)!;
    const keys = uniq(feeding.flatMap((r) => [...(assumptionsByResource.get(r) ?? [])]));
    const rowNotes = feeding.flatMap((r) => [...(adjustNotes.get(r) ?? [])]);
    const extra = {
      ...(keys.length ? { assumptions: keys } : {}),
      ...(rowNotes.length ? { notes: rowNotes } : {}),
    };
    const unit = CHECKLIST_UNITS[need];
    return {
      need,
      unit,
      provided: explained(
        p,
        `Σ output flows feeding ${need} × count × weekly factor × unit factor (${unit}/week)`,
        {
          terms: o,
          ...extra,
        },
      ),
      needed: explained(
        n,
        `Σ input flows feeding ${need} × count × weekly factor × unit factor (${unit}/week)`,
        {
          terms: i,
          ...extra,
        },
      ),
      pct: explained(pct, n === 0 ? 'nothing needs this, so 0' : 'min(1, provided ÷ needed)', {
        refs: { provided: p, needed: n },
      }),
      covered: n === 0 ? 'n/a' : pct >= 1 ? '✓' : '✗',
      resources: feeding,
    };
  });
  const scored = checklist.filter((r) => r.needed.value > 0);
  const overall = scored.length ? scored.reduce((a, r) => a + r.pct.value, 0) / scored.length : 0;
  const overallScore = explained(overall, 'average % covered over checklist rows with any need', {
    refs: Object.fromEntries(scored.map((r) => [r.need, r.pct.value])),
  });

  // Design Summary
  const row = (k: NeedKey) => checklist.find((r) => r.need === k)!;
  const flowTotal = (resource: string, dir: 'out' | 'in') =>
    (dir === 'out' ? resources[resource]!.produced : resources[resource]!.consumed).value;
  const active: [System, number][] = [];
  let totalCount = 0;
  let landSiteCount = 0;
  for (const s of catalog.systems) {
    const c = counts[s.id] ?? 0;
    if (c === 0) continue;
    active.push([s, c]);
    totalCount += c;
    // SUMIFS(Systems!C, "Land", Systems!L, 0): categories exactly "Land" and zero footprint
    if (s.categories.length === 1 && s.categories[0] === 'Land' && s.footprintSqft === 0) landSiteCount += c;
  }
  // SUMPRODUCT over Systems rows; refs hold each system's per-unit value (count is in the design).
  const systemSum = (formula: string, per: (s: System) => number): Explained => {
    let v = 0;
    const refs: Record<string, number> = {};
    for (const [s, c] of active) {
      const x = per(s);
      v += x * c;
      refs[s.id] = x;
    }
    return explained(v, formula, { refs });
  };
  const landAvailable = flowTotal('Land area', 'out');
  const landUsed = systemSum('Σ footprint × count (sq ft)', (s) => s.footprintSqft);
  const waterStorage = flowTotal('Water storage', 'out');
  const waterNeedPerDay = (row('Water').needed.value + row('Drinking water').needed.value) / 7;
  const batteryStorage = flowTotal('Battery storage', 'out');
  const elecPerDay = row('Electricity').needed.value / 7;
  const capitalIn = flowTotal('Capital', 'out');
  const capitalOut = flowTotal('Capital', 'in');
  const deficits = Object.values(resources).filter((r) => r.status === 'Deficit');
  const safeDiv = (a: number, b: number) => (b === 0 ? 0 : a / b);

  const summary: Record<SummaryKey, Explained> = {
    humans,
    systemsPlaced: explained(
      totalCount - humansN - landSiteCount,
      'Σ counts − Human Being − zero-footprint Land systems (Sunlight, Rainfall…)',
      { refs: { total: totalCount, humans: humansN, siteSystems: landSiteCount } },
    ),
    overallScore,
    costBuy: systemSum('Σ purchase cost × count ($)', (s) => s.costBuy),
    costCheapest: systemSum('Σ min(purchase, DIY) × count ($)', (s) =>
      s.costDiy === undefined ? s.costBuy : Math.min(s.costBuy, s.costDiy),
    ),
    setupLaborHrs: systemSum('Σ setup labor × count (hours)', (s) => s.setupLaborHrs),
    laborAvailable: explained(
      row('Est. Required Labor').provided.value,
      'labor provided per week (checklist)',
      {
        terms: row('Est. Required Labor').provided.explain.terms,
      },
    ),
    laborRequired: explained(row('Est. Required Labor').needed.value, 'labor needed per week (checklist)', {
      terms: row('Est. Required Labor').needed.explain.terms,
    }),
    landAvailable: explained(landAvailable, 'Σ Land area outputs (sq ft)', {
      terms: resources['Land area']!.produced.explain.terms,
    }),
    landUsed,
    landUsedPct: explained(safeDiv(landUsed.value, landAvailable), 'land used ÷ land available', {
      refs: { used: landUsed.value, available: landAvailable },
    }),
    waterStorage: explained(waterStorage, 'Σ Water storage capacity (gal)', {
      terms: resources['Water storage']!.produced.explain.terms,
    }),
    waterDays: explained(
      safeDiv(waterStorage, waterNeedPerDay),
      'water storage ÷ daily (Water + Drinking water) need',
      {
        refs: { storage: waterStorage, perDay: waterNeedPerDay },
      },
    ),
    batteryStorage: explained(batteryStorage, 'Σ Battery storage capacity (kWh)', {
      terms: resources['Battery storage']!.produced.explain.terms,
    }),
    batteryDays: explained(safeDiv(batteryStorage, elecPerDay), 'battery kWh ÷ daily electricity need', {
      refs: { storage: batteryStorage, perDay: elecPerDay },
    }),
    foodStorage: explained(flowTotal('Food storage', 'out'), 'Σ Food storage capacity (cu ft)', {
      terms: resources['Food storage']!.produced.explain.terms,
    }),
    capitalIn: explained(capitalIn, 'Σ Capital outputs ($/week)', {
      terms: resources['Capital']!.produced.explain.terms,
    }),
    capitalOut: explained(capitalOut, 'Σ Capital inputs ($/week)', {
      terms: resources['Capital']!.consumed.explain.terms,
    }),
    capitalNet: explained(capitalIn - capitalOut, 'capital in − capital out ($/week)', {
      refs: { in: capitalIn, out: capitalOut },
    }),
    wellbeing: explained(flowTotal('Wellbeing', 'out'), 'Σ Wellbeing outputs (points/week)', {
      terms: resources['Wellbeing']!.produced.explain.terms,
    }),
    deficitCount: explained(deficits.length, 'count of resources in deficit', {
      notes: deficits.map((d) => d.resource),
    }),
  };

  return { humans, checklist, overallScore, resources, summary };
}

/** The numbers of a balance result without provenance (for digests and comparisons). */
export function balanceValues(r: BalanceResult) {
  return {
    overallScore: r.overallScore.value,
    checklist: r.checklist.map((c) => ({
      need: c.need,
      provided: c.provided.value,
      needed: c.needed.value,
      pct: c.pct.value,
      covered: c.covered,
    })),
    summary: Object.fromEntries(Object.entries(r.summary).map(([k, v]) => [k, v.value])),
    resources: Object.fromEntries(
      Object.entries(r.resources).map(([k, v]) => [
        k,
        { produced: v.produced.value, consumed: v.consumed.value, status: v.status },
      ]),
    ),
  };
}
