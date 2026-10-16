import type { Catalog, System } from '@homestead/catalog';
import { getSystem } from '../catalog-index.ts';
import { canPlace, footprintSideFt } from '../time/game.ts';
import { computeSpatial, gapFt, rangeDistanceText } from '../time/spatial.ts';
import { getPlans } from '../time/plans.ts';
import type { GameState, Instance } from '../time/types.ts';

export interface PlacementConnection {
  id: string;
  name: string;
  x: number;
  y: number;
  half: number;
  resource: string;
  range: number | null;
  distance: number;
  inRange: boolean;
  text: string;
}
const matches = (s: System, selector: string) =>
  selector.startsWith('category:') ? s.categories.includes(selector.slice(9)) : s.id === selector;

/** Geometry uses the same footprint gaps and cutoffs as live spatial allocation, including invalid spots. */
export function placementPreview(
  state: GameState,
  catalog: Catalog,
  systemId: string,
  x: number,
  y: number,
  moves: { id: string; x: number; y: number }[] = [],
) {
  const sys = getSystem(catalog, systemId);
  const moving = new Map(moves.map((m) => [m.id, m]));
  const existing = moves.length ? state.instances.find((i) => i.id === moves[0]!.id) : undefined;
  const candidate: Instance = {
    ...(existing ?? {
      id: '__placement',
      systemId,
      buildMode: 'prebuilt',
      paid: 0,
      setupHoursNeeded: 0,
      setupHoursDone: 0,
      materialsDrawn: true,
      activeSince: 0,
      priority: sys.priorityTier,
    }),
    x,
    y,
    status: 'active',
  };
  const ignored = moves.map((m) => m.id);
  const check = moves.length
    ? (moves
        .map((m) =>
          canPlace(catalog, state, state.instances.find((i) => i.id === m.id)!.systemId, m.x, m.y, ignored),
        )
        .find((c) => !c.ok) ?? { ok: true as const })
    : canPlace(catalog, state, systemId, x, y);
  // Capacity assignment uses instance order. A move must preserve that order.
  const instances = state.instances.map((i) =>
    i.id === candidate.id ? candidate : { ...i, ...moving.get(i.id), status: 'active' as const },
  );
  const future: GameState = { ...state, instances: existing ? instances : [...instances, candidate] };
  const plans = getPlans(catalog, state.site);
  const plan = plans.bySystem.get(systemId)!;
  const half = footprintSideFt(sys.footprintSqft) / 2;
  const connections: PlacementConnection[] = [];
  const radii = new Set<number>();
  const add = (i: Instance, resource: string, range: number | null, within?: boolean, rule?: string) => {
    const other = getSystem(catalog, i.systemId);
    const ih = footprintSideFt(other.footprintSqft) / 2;
    const distance = gapFt(x, y, half, i.x, i.y, ih);
    const inRange = within ?? (range === null || distance <= range);
    if (range !== null) radii.add(range);
    const original = state.instances.find((p) => p.id === i.id);
    connections.push({
      id: i.id,
      name: `${other.name} (${i.id})${original?.status === 'building' ? ' — after construction' : ''}`,
      x: i.x,
      y: i.y,
      half: ih,
      resource,
      range,
      distance,
      inRange,
      text: `${resource}: ${rule ?? rangeDistanceText(distance, range)} · ${inRange ? 'in range' : 'out of range'}`,
    });
  };
  for (const i of future.instances) {
    if (i.id === candidate.id) continue;
    const other = getSystem(catalog, i.systemId);
    const p = plans.bySystem.get(i.systemId)!;
    for (const f of plan.outputs) {
      const meta = catalog.resources.find((r) => r.name === f.resource)!;
      if (meta.deliversTo === 'shelter' && p.outputs.some((o) => o.resource === 'Shelter'))
        add(
          i,
          f.resource,
          meta.deliveryRadiusFt,
          gapFt(x, y, half, i.x, i.y, footprintSideFt(other.footprintSqft) / 2) <= meta.deliveryRadiusFt,
        );
    }
    for (const a of catalog.assignedCapacities)
      if (
        (plan.inputs.some((f) => f.resource === a.resource) &&
          p.outputs.some((f) => f.resource === a.resource)) ||
        (plan.outputs.some((f) => f.resource === a.resource) &&
          p.inputs.some((f) => f.resource === a.resource))
      )
        add(i, a.resource, a.maxDistanceFt);
    for (const r of catalog.adjacencyRules) {
      if (!(matches(sys, r.from) && matches(other, r.to)) && !(matches(sys, r.to) && matches(other, r.from)))
        continue;
      const receiver = matches(sys, r.to) ? candidate : i;
      const source = receiver === candidate ? i : candidate;
      const rh = footprintSideFt(getSystem(catalog, receiver.systemId).footprintSqft) / 2;
      const inRange =
        r.scope === 'parcel' ||
        (r.scope === 'host'
          ? Math.abs(source.x - receiver.x) <= rh + 1e-6 && Math.abs(source.y - receiver.y) <= rh + 1e-6
          : gapFt(x, y, half, i.x, i.y, footprintSideFt(other.footprintSqft) / 2) <= r.radiusFt);
      add(
        i,
        r.effect.resource,
        r.scope === 'parcel' || r.scope === 'host' ? null : r.radiusFt,
        inRange,
        r.scope === 'host'
          ? 'source center must sit inside receiver footprint'
          : r.scope === 'parcel'
            ? 'parcel-wide effect'
            : undefined,
      );
    }
  }
  const spatial = computeSpatial(catalog, future).get(candidate.id);
  return {
    x,
    y,
    half,
    valid: check.ok,
    validation: check.ok ? 'Footprint fits; no overlap.' : check.reason,
    connections,
    radii: [...radii],
    notes: spatial?.notes ?? [],
    warning: Object.keys(spatial?.undelivered ?? {}).length
      ? `No delivered ${Object.keys(spatial!.undelivered).join(' / ')} at this spot. Placement is allowed, but the output will not reach a shelter.`
      : null,
    explanation:
      'Operating forecast after construction. Distances are shortest gaps between square footprint edges, not centers. Host modifiers must sit inside the host. Heat/cooling eligibility needs one shelter in range; eligible output joins the household pool. Range alone does not guarantee inputs, available capacity or output.',
  };
}
export type PlacementPreview = ReturnType<typeof placementPreview>;
