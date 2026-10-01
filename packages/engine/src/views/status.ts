import type { Catalog } from '@homestead/catalog';
import { statusText, type FeasibleResult } from '../balance/feasible.ts';
import { getSystem } from '../catalog-index.ts';
import { computeSpatial, groupKeyOf } from '../time/spatial.ts';
import type { GameState } from '../time/types.ts';
import { designBalance } from './hud.ts';

/** A placed system that isn't running fully (G11 map badges). Running systems have none. */
export interface InstanceStatus {
  level: 'partial' | 'blocked';
  /** The missing input, or "Shelter" when its heat or cooling doesn't reach one. */
  limitedBy: string | null;
  satisfaction: number;
  text: string;
}

/**
 * Status of every active placed system: yesterday's result from time mode, or (before the clock
 * has run for it) the feasible balance for its system. Heat and cooling that don't reach a
 * shelter show as partial. Outdoor systems (firepits) don't get a delivery badge: that is their nature.
 */
export function instanceStatuses(
  state: GameState,
  catalog: Catalog,
  given?: FeasibleResult,
): Map<string, InstanceStatus> {
  let cached = given;
  const bal = () => (cached ??= designBalance(state, catalog));
  const spatial = computeSpatial(catalog, state);
  const out = new Map<string, InstanceStatus>();
  for (const inst of state.instances) {
    if (inst.status !== 'active' || inst.person) continue;
    const sp = spatial.get(inst.id);
    const day = sp ? state.lastDay[groupKeyOf(inst, sp)] : undefined;
    const sat = day ? day.sat : (bal().systems[inst.systemId]?.satisfaction ?? 1);
    const limitedBy = day ? day.limitedBy : (bal().systems[inst.systemId]?.limitedBy ?? null);
    if (sat < 1 - 1e-6) {
      out.set(inst.id, {
        level: sat <= 1e-6 ? 'blocked' : 'partial',
        limitedBy,
        satisfaction: sat,
        text: statusText(sat, limitedBy),
      });
      continue;
    }
    const lost = Object.keys(sp?.undelivered ?? {});
    if (lost.length && !getSystem(catalog, inst.systemId).outdoor) {
      out.set(inst.id, {
        level: 'partial',
        limitedBy: 'Shelter',
        satisfaction: 1,
        text: `its ${lost.join(' and ').toLowerCase()} doesn't reach a shelter`,
      });
    }
  }
  return out;
}
