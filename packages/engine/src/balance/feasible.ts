import { type Assumptions, type Catalog, type NeedKey, type Resource } from '@homestead/catalog';
import { getSystem, indexCatalog } from '../catalog-index.ts';
import type { Design } from '../design.ts';
import { explained, type Explained, type Term } from '../provenance.ts';
import { BACKSTOP_CAP_MULT } from '../time/plans.ts';
import {
  assembleBalance,
  collectTerms,
  type BalanceResult,
  type BlockedSystem,
  type CollectedTerms,
} from './balance.ts';

/** How one system in the design runs once supply chains are taken into account. */
export interface SystemStatus {
  systemId: string;
  name: string;
  count: number;
  /** 1 = running fully, 0 = blocked. Outputs scale with this. */
  satisfaction: number;
  /** Product of boost-input effects (pollination, pest control…). */
  boostMult: number;
  /** The input that limits it (null when running fully). */
  limitedBy: string | null;
  /** Solver pass in which it first ran below full (1-based), so chains read in order. */
  curtailedAt: number | null;
  /** Share of its heat/cooling that reaches a shelter, by resource (only when below 1). */
  delivered: Record<string, number>;
  /** Plain words for the UI. */
  status: string;
}

/** Feasible balance: what the design actually delivers, with the potential ceiling beside it. */
export interface FeasibleResult extends BalanceResult {
  /** The same design with every input met (the spreadsheet's numbers). */
  potential: BalanceResult;
  systems: Record<string, SystemStatus>;
  /** Solver passes until nothing changed by more than 1e-9 (at most 200). */
  iterations: number;
  /**
   * Self-reliance (G12): average over rows with any need of coverage × the share of supply the
   * homestead makes itself (not backstops, not conventional services paid in Capital).
   */
  selfReliance: Explained;
  /** What backstops (grocery, grid, city water…) deliver and what it costs a week (G12). */
  backstops: {
    /** Per backstop system: units delivered a week, by resource. */
    delivered: Record<string, Record<string, number>>;
    /** Dollars a week by resource, plus connection fees. */
    bills: Record<string, number>;
    fees: number;
    weekly: Explained;
  };
}

export const FEASIBLE_MAX_ITERATIONS = 200;
export const FEASIBLE_TOLERANCE = 1e-9;

interface Req {
  flowId: string;
  sys: string;
  resource: string;
  role: string;
  /** Weekly amount for the whole count. */
  value: number;
  boostWeight: number;
}

const pctText = (x: number) => `${Math.round(x * 100)}%`;

export function statusText(sat: number, limitedBy: string | null): string {
  if (sat >= 1 - 1e-9) return 'running';
  if (sat <= 1e-9) return `blocked: no ${limitedBy ?? 'input'}`;
  return `partial: ${pctText(sat)} of ${limitedBy ?? 'its inputs'}`;
}

/**
 * Feasible balance mode (G11). Solves the weekly steady state with curtailment: every system
 * starts at satisfaction 1; each pass computes supply from current satisfactions, rations each
 * Flow resource by priority tier (proportionally within a tier), and sets each system's
 * satisfaction to the minimum over its required, capacity, and ambient inputs. Satisfactions
 * only decrease, so this converges to the largest feasible state. `need` inputs (people,
 * shelters' heat) are rationed but never switch anything off; Money is not rationed.
 *
 * Electricity follows time mode's storage rule: half of daytime demand can run straight off
 * production, the rest must pass through batteries (one charge a day). Heat and cooling count
 * toward the checklist only when they reach a shelter (`Resource.deliversTo`).
 */
export function balanceFeasible(catalog: Catalog, assumptions: Assumptions, design: Design): FeasibleResult {
  const idx = indexCatalog(catalog);
  const collected = collectTerms(catalog, assumptions, design);
  const potential = assembleBalance(catalog, design, collected);
  const meta = idx.resourceByName;
  const flowById = new Map(catalog.flows.map((f) => [f.id, f]));

  const systems = Object.keys(design.counts).filter((id) => (design.counts[id] ?? 0) > 0);
  const humanId = idx.systemByName.get('Human Being')?.id;

  // Requests by resource, from the input terms.
  const reqs: Req[] = [];
  for (const [resource, terms] of collected.inTerms) {
    for (const t of terms) {
      if (t.value <= 0) continue;
      const f = flowById.get(t.flowId)!;
      reqs.push({
        flowId: t.flowId,
        sys: t.systemId,
        resource,
        role: f.inputRole ?? 'required',
        value: t.value,
        boostWeight: f.boostWeight ?? 0,
      });
    }
  }

  // Who delivers heat/cooling to a shelter.
  const hasShelter = systems.some((id) =>
    (collected.outTerms.get('Shelter') ?? []).some((t) => t.systemId === id && t.value > 0),
  );
  const deliveredShare = (sys: string, resource: string): number => {
    const r = meta.get(resource);
    if (!r || r.deliversTo !== 'shelter') return 1;
    const given = design.delivered?.[sys]?.[resource];
    if (given !== undefined) return given;
    if (!hasShelter || getSystem(catalog, sys).outdoor) return 0;
    return 1;
  };

  const sat: Record<string, number> = {};
  const boost: Record<string, number> = {};
  const limitedBy: Record<string, string | null> = {};
  const curtailedAt: Record<string, number | null> = {};
  for (const id of systems) {
    sat[id] = 1;
    boost[id] = 1;
    limitedBy[id] = null;
    curtailedAt[id] = null;
  }
  const activity = (sys: string) => (sys === humanId ? 1 : sat[sys]! * boost[sys]!);
  const backstops = systems.filter((id) => getSystem(catalog, id).backstop);
  const isBackstop = new Set(backstops);
  let dispatched: Record<string, Record<string, number>> = {};

  const ambientMet = (resource: string): boolean => {
    if (design.ambient?.[resource]) return true;
    return (collected.outTerms.get(resource) ?? []).some((t) => t.value > 0);
  };

  let iterations = 0;
  let lastGrant = new Map<Req, number>();
  let lastSupply = new Map<string, number>();
  let lastCapReq = new Map<string, number>();
  for (let pass = 1; pass <= FEASIBLE_MAX_ITERATIONS; pass++) {
    iterations = pass;
    // Supply of each resource at current satisfactions.
    const supply = new Map<string, number>();
    for (const [resource, terms] of collected.outTerms) {
      const m = meta.get(resource)!;
      let s = 0;
      for (const t of terms) {
        if (isBackstop.has(t.systemId)) continue; // backstops fill what is left, below
        const scale = m.class === 'Capacity' ? 1 : activity(t.systemId) * deliveredShare(t.systemId, resource);
        s += t.value * scale;
      }
      supply.set(resource, s);
    }
    // Ration Flow resources: direct requests first, substitutes (Food ← eggs…) from what is left.
    const grant = new Map<Req, number>();
    const byRes = new Map<string, Req[]>();
    for (const q of reqs) {
      const m = meta.get(q.resource)!;
      if (m.class !== 'Flow' || (q.role !== 'required' && q.role !== 'need')) continue;
      let list = byRes.get(q.resource);
      if (!list) byRes.set(q.resource, (list = []));
      list.push(q);
    }
    const used = new Map<string, number>();
    const order = [...byRes.keys()].sort(
      (a, b) => Number(meta.get(a)!.satisfiedBy.length > 0) - Number(meta.get(b)!.satisfiedBy.length > 0) || a.localeCompare(b),
    );
    for (const resource of order) {
      const list = byRes.get(resource)!;
      const m = meta.get(resource)!;
      const total = list.reduce((a, q) => a + q.value, 0);
      let available: number;
      if (m.satisfiedBy.length) {
        const f = m.factorToNeed ?? 1;
        available = 0;
        for (const sub of m.satisfiedBy) {
          const left = Math.max(0, (supply.get(sub) ?? 0) - (used.get(sub) ?? 0));
          available += (left * (meta.get(sub)!.factorToNeed ?? 1)) / f;
        }
      } else {
        available = storageAware(m, resource, supply, total, collected, meta);
      }
      const given = rationByTier(list, available, (q) => getSystem(catalog, q.sys).priorityTier);
      let g = 0;
      for (const [q, v] of given) {
        grant.set(q, v);
        g += v;
      }
      used.set(resource, (used.get(resource) ?? 0) + g);
    }
    // Backstops (G12): fill each sold resource's unmet requests, up to 3 × their catalog output.
    dispatched = {};
    for (const [resource, list] of byRes) {
      const sellers = backstops.filter((id) => getSystem(catalog, id).backstopPrices[resource] !== undefined);
      if (!sellers.length) continue;
      const open = list.filter((q) => !isBackstop.has(q.sys));
      let unmet = 0;
      for (const q of open) unmet += Math.max(0, q.value - (grant.get(q) ?? 0));
      if (unmet <= 1e-12) continue;
      let delivered = 0;
      for (const id of sellers) {
        let cap = 0;
        for (const t of collected.outTerms.get(resource) ?? []) if (t.systemId === id) cap += t.value * BACKSTOP_CAP_MULT;
        const give = Math.min(unmet - delivered, cap * sat[id]!);
        if (give <= 0) continue;
        (dispatched[id] ??= {})[resource] = give;
        delivered += give;
      }
      const tops = open.map((q) => ({ ...q, value: Math.max(0, q.value - (grant.get(q) ?? 0)) }));
      const extra = rationByTier(tops, delivered, (q) => getSystem(catalog, q.sys).priorityTier);
      tops.forEach((t, k) => grant.set(open[k]!, (grant.get(open[k]!) ?? 0) + (extra.get(t) ?? 0)));
    }
    // Capacity and service ratios.
    const capReq = new Map<string, number>();
    const boostReq = new Map<string, number>();
    for (const q of reqs) {
      if (q.role === 'capacity') capReq.set(q.resource, (capReq.get(q.resource) ?? 0) + q.value);
      if (q.role === 'boost') boostReq.set(q.resource, (boostReq.get(q.resource) ?? 0) + q.value);
    }
    const ratio = (have: number, want: number) => (want <= 0 ? 1 : Math.min(1, have / want));
    lastGrant = grant;
    lastSupply = supply;
    lastCapReq = capReq;

    let changed = 0;
    const nextSat: Record<string, number> = {};
    const nextLim: Record<string, string | null> = {};
    const nextBoost: Record<string, number> = {};
    for (const id of systems) {
      nextSat[id] = 1;
      nextLim[id] = null;
      nextBoost[id] = 1;
    }
    for (const q of reqs) {
      if (q.sys === humanId) continue;
      let r = 1;
      switch (q.role) {
        case 'required':
          if (meta.get(q.resource)!.class !== 'Flow') continue;
          r = (grant.get(q) ?? 0) / q.value;
          break;
        case 'capacity':
          r = ratio(supply.get(q.resource) ?? 0, capReq.get(q.resource)!);
          break;
        case 'ambient':
          r = ambientMet(q.resource) ? 1 : 0;
          break;
        case 'boost': {
          const s = ratio(supply.get(q.resource) ?? 0, boostReq.get(q.resource)!);
          nextBoost[q.sys]! *= 1 - q.boostWeight * (1 - s);
          continue;
        }
        default:
          continue;
      }
      if (r < nextSat[q.sys]!) {
        nextSat[q.sys] = r;
        nextLim[q.sys] = q.resource;
      }
    }
    for (const id of systems) {
      const s = Math.min(sat[id]!, nextSat[id]!);
      const b = Math.min(boost[id]!, nextBoost[id]!);
      changed = Math.max(changed, Math.abs(s - sat[id]!), Math.abs(b - boost[id]!));
      if (s < sat[id]! - FEASIBLE_TOLERANCE) limitedBy[id] = nextLim[id] ?? limitedBy[id]!;
      if (s < 1 - FEASIBLE_TOLERANCE && curtailedAt[id] === null) curtailedAt[id] = pass;
      sat[id] = s;
      boost[id] = b;
    }
    if (changed <= FEASIBLE_TOLERANCE) break;
  }

  // Scale the terms by what actually ran.
  // Bills: units delivered × price, plus connection fees.
  const bills: Record<string, number> = {};
  let fees = 0;
  const share: Record<string, Record<string, number>> = {}; // backstop → resource → delivered ÷ catalog output
  for (const id of backstops) {
    const sys = getSystem(catalog, id);
    fees += sys.backstopFee * design.counts[id]!;
    const nominal = (r: string) =>
      (collected.outTerms.get(r) ?? []).filter((t) => t.systemId === id).reduce((a, t) => a + t.value, 0);
    const primary = Object.keys(sys.backstopPrices)[0];
    const sh: Record<string, number> = {};
    for (const [r, v] of Object.entries(dispatched[id] ?? {})) {
      bills[r] = (bills[r] ?? 0) + v * sys.backstopPrices[r]!;
      sh[r] = nominal(r) > 0 ? v / nominal(r) : 0;
    }
    for (const [r] of collected.outTerms) {
      if (sh[r] !== undefined || sys.backstopPrices[r] !== undefined) continue;
      if (nominal(r) > 0) sh[r] = primary ? (sh[primary] ?? 0) : 0; // by-products follow the main output
    }
    share[id] = sh;
  }
  const scaledOut = (resource: string, t: Term, forNeed: boolean): Term => {
    const m = meta.get(resource)!;
    if (isBackstop.has(t.systemId) && m.class !== 'Capacity') {
      const f = share[t.systemId]?.[resource] ?? 0;
      return { ...t, satisfaction: f, value: t.value * f };
    }
    if (m.class === 'Capacity' || t.systemId === humanId) return t;
    const a = activity(t.systemId);
    const d = forNeed ? deliveredShare(t.systemId, resource) : 1;
    if (a === 1 && d === 1) return t;
    return {
      ...t,
      satisfaction: a,
      ...(d !== 1 ? { delivered: d } : {}),
      value: t.value * a * d,
    };
  };
  const out: CollectedTerms = {
    outTerms: new Map(
      [...collected.outTerms].map(([r, ts]) => [r, ts.map((t) => scaledOut(r, t, false))]),
    ),
    inTerms: new Map(
      [...collected.inTerms].map(([r, ts]) => [
        r,
        r !== 'Capital'
          ? ts
          : ts.map((t) => {
              if (!isBackstop.has(t.systemId)) return t;
              const sys = getSystem(catalog, t.systemId);
              let bill = sys.backstopFee * t.count;
              for (const [res, v] of Object.entries(dispatched[t.systemId] ?? {})) bill += v * sys.backstopPrices[res]!;
              return { ...t, value: bill };
            }),
      ]),
    ),
    needOut: new Map(
      [...collected.needOut].map(([k, ts]) => [
        k,
        ts.map((t) => scaledOut(flowById.get(t.flowId)!.resource, t, true)),
      ]),
    ) as Map<NeedKey, Term[]>,
    needIn: collected.needIn,
    assumptionsByResource: collected.assumptionsByResource,
    adjustNotes: collected.adjustNotes,
  };
  const actual = assembleBalance(catalog, design, out);

  const statuses: Record<string, SystemStatus> = {};
  for (const id of systems) {
    const s = id === humanId ? 1 : sat[id]!;
    const delivered: Record<string, number> = {};
    for (const [resource, terms] of collected.outTerms) {
      if (!terms.some((t) => t.systemId === id && t.value > 0)) continue;
      const d = deliveredShare(id, resource);
      if (d < 1) delivered[resource] = d;
    }
    statuses[id] = {
      systemId: id,
      name: getSystem(catalog, id).name,
      count: design.counts[id]!,
      satisfaction: s,
      boostMult: boost[id]!,
      limitedBy: s < 1 - FEASIBLE_TOLERANCE ? limitedBy[id]! : null,
      curtailedAt: id === humanId ? null : curtailedAt[id]!,
      delivered,
      status: statusText(s, limitedBy[id]!),
    };
  }

  // What need-row consumers actually received (time mode's "delivered"), by flow.
  const receivedShare = new Map<string, number>(); // `${flowId}|${systemId}` → share of the request met
  for (const q of reqs) {
    const m = meta.get(q.resource)!;
    let share = 1;
    if (m.class === 'Capacity')
      share = Math.min(1, (lastSupply.get(q.resource) ?? 0) / Math.max(1e-12, lastCapReq.get(q.resource) ?? 0));
    else if (m.class === 'Flow' && (q.role === 'required' || q.role === 'need')) share = (lastGrant.get(q) ?? 0) / q.value;
    else continue;
    receivedShare.set(`${q.flowId}|${q.sys}`, share);
  }

  // Checklist rows: actual beside potential, with the systems holding each row back.
  for (const row of actual.checklist) {
    let delivered = 0;
    for (const t of collected.needIn.get(row.need) ?? []) delivered += t.value * (receivedShare.get(`${t.flowId}|${t.systemId}`) ?? 1);
    const needed = row.needed.value;
    const pct = needed > 0 ? Math.min(1, delivered / needed) : 0;
    row.pct = explained(pct, needed === 0 ? 'nothing needs this, so 0' : 'min(1, delivered ÷ needed): what consumers actually received', {
      refs: { delivered, needed, actual: row.provided.value },
    });
    row.covered = needed === 0 ? 'n/a' : pct >= 1 - 1e-9 ? '✓' : '✗';
    const p = potential.checklist.find((r) => r.need === row.need)!;
    row.potential = explained(p.provided.value, `if every input were met: ${p.provided.explain.formula}`, {
      terms: p.provided.explain.terms,
    });
    const blocked: BlockedSystem[] = [];
    const seen = new Set<string>();
    for (const t of collected.needOut.get(row.need) ?? []) {
      const st = statuses[t.systemId];
      if (!st || seen.has(t.systemId) || t.value <= 0) continue;
      const resource = flowById.get(t.flowId)!.resource;
      const d = deliveredShare(t.systemId, resource);
      if (st.satisfaction < 1 - FEASIBLE_TOLERANCE) {
        seen.add(t.systemId);
        blocked.push({
          systemId: st.systemId,
          name: st.name,
          count: st.count,
          satisfaction: st.satisfaction,
          limitedBy: st.limitedBy,
          status: st.status,
        });
      } else if (d < 1) {
        seen.add(t.systemId);
        blocked.push({
          systemId: st.systemId,
          name: st.name,
          count: st.count,
          satisfaction: d,
          limitedBy: null,
          status: getSystem(catalog, t.systemId).outdoor
            ? `outdoors: its ${resource.toLowerCase()} doesn't reach a shelter`
            : `not near a shelter: ${pctText(1 - d)} of its ${resource.toLowerCase()} is lost`,
        });
      }
    }
    blocked.sort((a, b) => a.satisfaction - b.satisfaction || a.name.localeCompare(b.name));
    row.blocked = blocked;
    const notes = [...(row.provided.explain.notes ?? [])];
    if (blocked.length)
      notes.push(
        `${blocked.length} system${blocked.length === 1 ? '' : 's'} held back: ${blocked.map((b) => `${b.name} (${b.status})`).join('; ')}.`,
      );
    row.provided = explained(row.provided.value, `actual: ${row.provided.explain.formula} × satisfaction`, {
      ...row.provided.explain,
      notes,
      refs: { potential: p.provided.value },
    });
  }
  const scored = actual.checklist.filter((r) => r.needed.value > 0);
  const overall = scored.length ? scored.reduce((a, r) => a + r.pct.value, 0) / scored.length : 0;
  const overallScore = explained(overall, 'average actual % covered over checklist rows with any need', {
    refs: Object.fromEntries(scored.map((r) => [r.need, r.pct.value])),
    notes: [`If every input were met: ${pctText(potential.overallScore.value)}.`],
  });
  const weeklyBill = Object.values(bills).reduce((a, b) => a + b, 0) + fees;
  // Self-reliance: what each row's supply owes to bought sources.
  const boughtSys = new Set(
    systems.filter((id) => {
      const sys = getSystem(catalog, id);
      return (
        sys.backstop ||
        (sys.categories.includes('Conventional') &&
          (collected.inTerms.get('Capital') ?? []).some((t) => t.systemId === id && t.value > 0))
      );
    }),
  );
  let srSum = 0;
  for (const row of actual.checklist) {
    const terms = out.needOut.get(row.need) ?? [];
    const total = terms.reduce((a, t) => a + t.value, 0);
    const bought = terms.filter((t) => boughtSys.has(t.systemId)).reduce((a, t) => a + t.value, 0);
    const sr = total > 1e-12 ? Math.max(0, 1 - bought / total) : 0;
    row.selfReliance = explained(sr, '1 − bought supply ÷ all supply (backstops and paid services count as bought)', {
      refs: { bought, supply: total },
    });
    if (row.needed.value > 0 && row.need !== 'Est. Required Labor') srSum += sr * row.pct.value;
  }
  const supplyRows = scored.filter((r) => r.need !== 'Est. Required Labor');
  const selfReliance = explained(
    supplyRows.length ? srSum / supplyRows.length : 0,
    'average over rows with any need (labor left out) of (% covered × share made at home)',
    { refs: Object.fromEntries(supplyRows.map((r) => [r.need, r.selfReliance!.value])) },
  );
  return {
    ...actual,
    overallScore,
    summary: { ...actual.summary, overallScore },
    potential,
    systems: statuses,
    iterations,
    selfReliance,
    backstops: {
      delivered: dispatched,
      bills,
      fees,
      weekly: explained(weeklyBill, 'Σ backstop units delivered × price + connection fees ($/week)', {
        refs: { ...bills, fees },
      }),
    },
  };
}

/**
 * What a week of supply can actually serve, given storage (time mode's rules as weekly averages).
 * Electricity: half of demand can run straight off production; the rest must pass through
 * batteries, one charge a day. Other stored resources: a day's production must fit in their
 * storage pool (capacity plus its small buffer), shared across the pool's members.
 */
function storageAware(
  m: Resource,
  resource: string,
  supply: Map<string, number>,
  demand: number,
  c: CollectedTerms,
  meta: Map<string, Resource>,
): number {
  const produced = supply.get(resource) ?? 0;
  if (!m.storedIn || !m.storable) return produced;
  const rule = m.storedIn;
  let cap = rule.buffer;
  for (const t of c.outTerms.get(rule.capacityResource) ?? []) cap += t.value;
  if (m.directUseShare > 0) {
    const s = m.directUseShare;
    return Math.min(s * produced, s * demand) + Math.min((1 - s) * produced, 7 * cap * rule.unitsPerCapacityUnit);
  }
  // Pool volume produced per day across every member of the pool.
  let dailyVolume = 0;
  for (const r of meta.values()) {
    if (r.storedIn?.capacityResource !== rule.capacityResource) continue;
    dailyVolume += (supply.get(r.name) ?? 0) / 7 / r.storedIn.unitsPerCapacityUnit;
  }
  if (dailyVolume <= cap) return produced;
  return produced * (cap / dailyVolume);
}

/** Proportional within a tier, tiers in ascending order. */
function rationByTier(list: Req[], available: number, tierOf: (q: Req) => number): Map<Req, number> {
  const out = new Map<Req, number>();
  let avail = Math.max(0, available);
  const tiers = [...new Set(list.map(tierOf))].sort((a, b) => a - b);
  for (const t of tiers) {
    const inTier = list.filter((q) => tierOf(q) === t);
    const total = inTier.reduce((a, q) => a + q.value, 0);
    const share = total <= 0 ? 1 : Math.min(1, avail / total);
    for (const q of inTier) out.set(q, q.value * share);
    avail = Math.max(0, avail - total * share);
  }
  return out;
}

