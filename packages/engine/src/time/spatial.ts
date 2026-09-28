import type { AdjacencyRule, Catalog, System } from '@homestead/catalog';
import { getSystem } from '../catalog-index.ts';
import { parcelSideFt } from './game.ts';
import { getPlans } from './plans.ts';
import type { GameState, Instance } from './types.ts';

/** How an instance's position changes its flows. */
export interface InstanceSpatial {
  /** Multiplier on input requests, by resource (shade lowers a shelter's cooling load). */
  inMult: Record<string, number>;
  /** Multiplier on outputs, by resource (chickens by the compost, trees by a turbine, slope). */
  outMult: Record<string, number>;
  /** Boost inputs that need a source in range: false = none in range (pollination). */
  gated: Record<string, boolean>;
  /** Assigned capacities: which provider serves this consumer, and what share of its need fits. */
  assigned: Record<string, { providerId: string | null; share: number; distanceFt: number | null }>;
  /** Plain language for "why" popovers. */
  notes: string[];
  /** Instances with the same signature behave identically (the engine groups them). */
  sig: string;
}

const NONE: InstanceSpatial = Object.freeze({
  inMult: {},
  outMult: {},
  gated: {},
  assigned: {},
  notes: [],
  sig: '',
}) as InstanceSpatial;

/** Existing trees are drawn with a ~28 ft crown. */
const EXISTING_TREE_HALF_FT = 14;

function halfOf(sys: System): number {
  return sys.footprintSqft > 0 ? Math.sqrt(sys.footprintSqft) / 2 : 0;
}

function matches(sys: System, sel: string): boolean {
  return sel.startsWith('category:') ? sys.categories.includes(sel.slice(9)) : sys.id === sel;
}

interface Source {
  x: number;
  y: number;
  /** Half the footprint side (0 for a point such as an existing tree's trunk). */
  half: number;
  label: string;
}

/** Gap between two square footprints (0 if they touch or overlap). */
function gapFt(ax: number, ay: number, ah: number, bx: number, by: number, bh: number): number {
  const dx = Math.max(0, Math.abs(ax - bx) - ah - bh);
  const dy = Math.max(0, Math.abs(ay - by) - ah - bh);
  return Math.hypot(dx, dy);
}

/** One-entry cache per catalog, keyed by what spatial effects depend on (not array identity). */
const cache = new WeakMap<Catalog, { key: string; site: unknown; map: Map<string, InstanceSpatial> }>();

function spatialKey(state: GameState): string {
  let k = `${state.settings.parcelAcres}`;
  for (const i of state.instances) {
    k += `;${i.id},${i.systemId},${i.x},${i.y},${i.status === 'active' ? 1 : 0},${i.scale ?? 1}`;
    if (i.links) k += `,${JSON.stringify(i.links)}`;
  }
  return k;
}

/**
 * Spatial effects for every instance, from the catalog's adjacency, terrain, and
 * assigned-capacity rules (all from catalog_overrides.json). Cached per instance list.
 */
export function computeSpatial(catalog: Catalog, state: GameState): Map<string, InstanceSpatial> {
  const key = spatialKey(state);
  const hit = cache.get(catalog);
  if (hit && hit.site === state.site && hit.key === key) return hit.map;
  const plans = getPlans(catalog, state.site);
  const side = parcelSideFt(state.settings);
  const active = state.instances.filter((i) => i.status === 'active');
  const sysOf = (i: Instance) => getSystem(catalog, i.systemId);
  const work = new Map<string, InstanceSpatial>();
  const get = (id: string): InstanceSpatial => {
    let s = work.get(id);
    if (!s) work.set(id, (s = { inMult: {}, outMult: {}, gated: {}, assigned: {}, notes: [], sig: '' }));
    return s;
  };

  // Adjacency: group rules by (receiver, resource, direction, mode) so floors apply to the combined effect.
  const sourcesFor = (rule: AdjacencyRule): Source[] => {
    if (rule.from === 'terrain:tree') {
      return state.site.terrain.existingTrees.map((t) => ({
        x: t.x * side,
        y: t.y * side,
        half: EXISTING_TREE_HALF_FT,
        label: `existing ${t.species}`,
      }));
    }
    return active
      .filter((i) => matches(sysOf(i), rule.from))
      .map((i) => ({ x: i.x, y: i.y, half: halfOf(sysOf(i)), label: `${sysOf(i).name} (${i.id})` }));
  };
  for (const recv of state.instances) {
    const sys = sysOf(recv);
    const plan = plans.bySystem.get(sys.id)!;
    const rh = halfOf(sys);
    const combined = new Map<
      string,
      {
        mult: number;
        floor: number;
        mode: 'scale' | 'require';
        any: boolean;
        notes: string[];
        once: Set<number>;
      }
    >();
    for (const rule of catalog.adjacencyRules) {
      if (!matches(sys, rule.to)) continue;
      const e = rule.effect;
      const has =
        e.direction === 'in'
          ? plan.inputs.some((f) => f.resource === e.resource)
          : plan.outputs.some((f) => f.resource === e.resource);
      if (!has) continue;
      const key = `${e.direction}|${e.resource}|${e.mode}`;
      const c = combined.get(key) ?? {
        mult: 1,
        floor: 0,
        mode: e.mode,
        any: false,
        notes: [],
        once: new Set<number>(),
      };
      const inRange = sourcesFor(rule).filter(
        (src) => src !== undefined && gapFt(src.x, src.y, src.half, recv.x, recv.y, rh) <= rule.radiusFt,
      );
      if (inRange.length) {
        c.any = true;
        if (e.stack === 'once') {
          // Applies once however many rules and sources reach it.
          if (!c.once.has(e.multiplier)) c.mult *= e.multiplier;
          c.once.add(e.multiplier);
        } else c.mult *= e.multiplier ** inRange.length;
        if (e.floor !== undefined) c.floor = Math.max(c.floor, e.floor);
        c.notes.push(
          `${rule.note} In range: ${inRange
            .slice(0, 3)
            .map((x) => x.label)
            .join(', ')}${inRange.length > 3 ? ` and ${inRange.length - 3} more` : ''}.`,
        );
      }
      combined.set(key, c);
    }
    for (const [key, c] of combined) {
      const [dir, res] = key.split('|') as ['in' | 'out', string];
      if (c.mode === 'require') {
        const s = get(recv.id);
        s.gated[res] = c.any;
        if (!c.any) s.notes.push(`No source of ${res} within range, so this gets none.`);
        else s.notes.push(...c.notes);
        continue;
      }
      if (!c.any) continue;
      const m = Math.max(c.floor, c.mult);
      const s = get(recv.id);
      (dir === 'in' ? s.inMult : s.outMult)[res] = m;
      s.notes.push(...c.notes, `${res} ${dir === 'in' ? 'needed' : 'made'} × ${m.toFixed(3)}.`);
    }
    // Terrain (slope) rules.
    for (const t of catalog.terrainRules) {
      if (t.to !== sys.id) continue;
      const m = Math.min(t.max, Math.max(t.min, 1 + t.perSlopePct * state.site.terrain.slopePct));
      if (Math.abs(m - 1) < 1e-12) continue;
      const s = get(recv.id);
      const bag = t.direction === 'in' ? s.inMult : s.outMult;
      bag[t.resource] = (bag[t.resource] ?? 1) * m;
      s.notes.push(
        `${t.note} This site's slope is ${state.site.terrain.slopePct}%: ${t.resource} × ${m.toFixed(2)}.`,
      );
    }
  }

  // Assigned capacities (roofs for rain catchment, paddocks for grazing animals).
  for (const a of catalog.assignedCapacities) {
    const providers = active
      .map((i) => {
        const out = plans.bySystem
          .get(i.systemId)!
          .outputs.find((o) => o.resource === a.resource && o.isCapacity);
        return out ? { inst: i, room: out.qty * (work.get(i.id)?.outMult[a.resource] ?? 1) } : null;
      })
      .filter((p): p is { inst: Instance; room: number } => p !== null);
    const consumers = state.instances.filter((i) =>
      plans.bySystem.get(i.systemId)!.inputs.some((f) => f.resource === a.resource && f.role === 'capacity'),
    );
    // Explicit links first, then everyone else in placement order.
    const ordered = [
      ...consumers.filter((c) => c.links?.[a.resource]),
      ...consumers.filter((c) => !c.links?.[a.resource]),
    ];
    for (const c of ordered) {
      const need = plans.bySystem.get(c.systemId)!.inputs.find((f) => f.resource === a.resource)!.qty;
      const ch = halfOf(sysOf(c));
      const dist = (p: Instance) => gapFt(p.x, p.y, halfOf(sysOf(p)), c.x, c.y, ch);
      const ok = (p: { inst: Instance; room: number }) =>
        a.maxDistanceFt === null || dist(p.inst) <= a.maxDistanceFt;
      const linked = c.links?.[a.resource];
      let pick = linked ? providers.find((p) => p.inst.id === linked && ok(p)) : undefined;
      if (!pick) {
        pick = providers
          .filter((p) => ok(p) && p.room > 1e-9)
          .sort((x, y) => dist(x.inst) - dist(y.inst) || x.inst.id.localeCompare(y.inst.id))[0];
      }
      const s = get(c.id);
      if (!pick) {
        s.assigned[a.resource] = { providerId: null, share: 0, distanceFt: null };
        s.notes.push(
          a.maxDistanceFt === null
            ? `No ${a.resource} with room to link to.`
            : `No ${a.resource} with room within ${a.maxDistanceFt} ft.`,
        );
        continue;
      }
      const share = need > 0 ? Math.min(1, pick.room / need) : 1;
      pick.room = Math.max(0, pick.room - need);
      s.assigned[a.resource] = { providerId: pick.inst.id, share, distanceFt: dist(pick.inst) };
      s.notes.push(
        `Linked to ${sysOf(pick.inst).name} (${pick.inst.id}) ${Math.round(dist(pick.inst))} ft away for ${a.resource}${share < 1 ? `: only ${Math.round(share * 100)}% of the need fits` : ''}.`,
      );
    }
  }

  const map = new Map<string, InstanceSpatial>();
  for (const inst of state.instances) {
    const s = work.get(inst.id);
    if (!s) {
      map.set(inst.id, NONE);
      continue;
    }
    const r = (x: number) => Math.round(x * 1e6) / 1e6;
    s.sig = JSON.stringify([
      Object.entries(s.inMult).map(([k, v]) => [k, r(v)]),
      Object.entries(s.outMult).map(([k, v]) => [k, r(v)]),
      Object.entries(s.gated),
      Object.entries(s.assigned).map(([k, v]) => [k, r(v.share)]),
    ]);
    map.set(inst.id, s);
  }
  cache.set(catalog, { key, site: state.site, map });
  return map;
}

/** The engine's group key for an instance (system, priority, spatial signature, household scale). */
export function groupKeyOf(inst: Instance, spatial: InstanceSpatial): string {
  const scale = inst.scale ?? 1;
  return `${inst.systemId}|${inst.priority}${spatial.sig ? `|${spatial.sig}` : ''}${scale !== 1 ? `|s${scale}` : ''}`;
}

export function instanceGroupKey(catalog: Catalog, state: GameState, inst: Instance): string {
  return groupKeyOf(inst, computeSpatial(catalog, state).get(inst.id) ?? NONE);
}
