import type { Catalog, ToolRule } from '@homestead/catalog';
import { explained } from '../provenance.ts';
import { getSystem } from '../catalog-index.ts';
import { JOBS, type JobId } from './gather.ts';
import { conditionOutput } from './maintenance.ts';
import type { GameState, Instance } from './types.ts';

/** LL-34 (`toolGathering`): tools multiply a gathering job's yield per hour at the land's own nodes. */

/** One person can work one tool for at most this many hours a day. */
export const TOOL_HOURS_PER_DAY = 8;

export function toolRule(catalog: Catalog, systemId: string): ToolRule | null {
  return catalog.toolRules?.find((t) => t.systemId === systemId) ?? null;
}

/** What the household's tools add to gathering `resource` today, before fuel. */
export interface ToolCapacity {
  rule: ToolRule;
  /** Tool hours available today (instances × hours a day). */
  hours: number;
  /** Average condition factor (LL-28): a worn-out tool gives less boost. */
  condition: number;
  ids: string[];
}

export function toolCapacity(
  catalog: Catalog,
  state: Pick<GameState, 'settings'>,
  instances: readonly Instance[],
  job: JobId,
  resource: string,
): ToolCapacity | null {
  if (!state.settings.toolGathering) return null;
  const rule = catalog.toolRules?.find((t) => t.job === job && t.resource === resource);
  if (!rule) return null;
  const tools = instances.filter((i) => i.status === 'active' && i.systemId === rule.systemId);
  if (!tools.length) return null;
  const sys = getSystem(catalog, rule.systemId);
  const condition = state.settings.wearAndRepair
    ? tools.reduce((a, i) => a + conditionOutput(i, sys), 0) / tools.length
    : 1;
  const hours = tools.reduce((a, i) => a + (i.scale ?? 1), 0) * TOOL_HOURS_PER_DAY;
  return { rule, hours, condition, ids: tools.map((i) => i.id) };
}

/**
 * The share of `workHours` (hours at the node, walking excluded) the tools can cover, given tool
 * hours left and fuel in stock; the effective multiplier is 1 + (multiplier − 1) × condition × share.
 */
export function toolShare(cap: ToolCapacity, toolHoursLeft: number, fuelStock: number, workHours: number): number {
  if (workHours <= 1e-12) return 0;
  let share = Math.min(1, toolHoursLeft / workHours);
  if (cap.rule.fuel) share = Math.min(share, fuelStock / (workHours * cap.rule.fuel.perHour));
  return Math.max(0, share);
}

export function toolMultiplier(cap: ToolCapacity, share: number): number {
  return 1 + (cap.rule.multiplier - 1) * cap.condition * share;
}

/** Card model for a tool under the gate: every number comes from here. */
export function toolView(state: GameState, catalog: Catalog, id: string) {
  const inst = state.instances.find((i) => i.id === id);
  const rule = inst && toolRule(catalog, inst.systemId);
  if (!state.settings.toolGathering || !inst || !rule) return null;
  const sys = getSystem(catalog, rule.systemId);
  const recent = state.ledgers.slice(-7).flatMap((l) => (l.gathered ?? []).filter((g) => g.toolIds?.includes(id)));
  const share = (g: (typeof recent)[number]) => 1 / (g.toolIds?.length ?? 1);
  return {
    job: JOBS.find((j) => j.id === rule.job)!.label,
    resource: rule.resource,
    multiplier: explained(rule.multiplier, rule.note),
    condition: explained(
      state.settings.wearAndRepair ? conditionOutput(inst, sys) : 1,
      'LL-28 condition factor applied to the extra yield (1 when wear is off)',
    ),
    fuel: rule.fuel
      ? { resource: rule.fuel.resource, perHour: explained(rule.fuel.perHour, rule.note), stock: explained(state.stocks[rule.fuel.resource] ?? 0, `${rule.fuel.resource} in stock now`) }
      : null,
    hoursPerDay: explained(TOOL_HOURS_PER_DAY * (inst.scale ?? 1), 'one person works one tool up to 8 h a day'),
    toolHoursWeek: explained(recent.reduce((a, g) => a + (g.toolHours ?? 0) * share(g), 0), 'hours this tool worked at nodes, last 7 days'),
    extraWeek: explained(recent.reduce((a, g) => a + (g.toolExtra ?? 0) * share(g), 0), `extra ${rule.resource} over hand gathering, last 7 days`),
    fuelWeek: explained(recent.reduce((a, g) => a + (g.fuel ?? 0) * share(g), 0), 'fuel burned at nodes, last 7 days'),
  };
}
