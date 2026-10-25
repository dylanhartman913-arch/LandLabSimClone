import type { Catalog } from '@homestead/catalog';
import { explained } from '../provenance.ts';
import { climateTable } from './climate.ts';
import { TOOL_HOURS_PER_DAY } from './constants.ts';
import { conditionOutput } from './maintenance.ts';
import { dailyAmount, getPlans, shapeValue } from './plans.ts';
import { statePools } from './storage.ts';
import type { GameState, Instance } from './types.ts';
import { weatherFor } from './weather.ts';

export type FodderState = Pick<GameState, 'settings'> &
  Partial<Pick<GameState, 'site' | 'calendar' | 'yearWeather'>>;

/** Conservative reservation: cutting receives tool time before node gathering, with no double use. */
export function fodderPlan(catalog: Catalog, state: FodderState, instances: readonly Instance[]) {
  const rule = catalog.fodder;
  if (!rule || !state.site || !state.calendar) return [];
  const day = state.calendar.day;
  const meadows = instances.filter((i) => i.status === 'active' && i.systemId === rule.meadowId);
  if (!meadows.length) return [];
  const plan = getPlans(catalog, state.site).bySystem.get(rule.meadowId)!;
  const labor = plan.inputs.find((f) => f.resource === 'Labor')!;
  const hay = plan.outputs.find((f) => f.resource === 'Hay')!;
  const table = climateTable(state.site);
  const weather = weatherFor(state.site, table, day, state.settings.weatherMode, state.yearWeather);
  const rainFactor =
    Math.min(1, state.site.assumptions.precipIn / rule.rainReferenceIn) *
    (state.settings.weatherMode === 'real' && state.yearWeather
      ? Math.max(rule.droughtFloor, Math.min(1, state.yearWeather.precipMult))
      : 1);
  const upkeep = plan.system.weeklyUpkeepHrs / 7;
  const handCut = Math.max(0, labor.weekly / 7 - upkeep) * shapeValue(hay, day, weather, table) * rainFactor;
  const tools = state.settings.toolGathering
    ? instances.filter((i) => i.status === 'active' && i.systemId === rule.scytheId)
    : [];
  const toolScale = tools.reduce((n, i) => n + (i.scale ?? 1), 0);
  const toolSystem = catalog.systems.find((s) => s.id === rule.scytheId)!;
  const condition =
    toolScale > 0
      ? tools.reduce(
          (n, i) => n + (i.scale ?? 1) * (state.settings.wearAndRepair ? conditionOutput(i, toolSystem) : 1),
          0,
        ) / toolScale
      : 0;
  const multiplier =
    1 + ((catalog.toolRules?.find((t) => t.systemId === rule.scytheId)?.multiplier ?? 1) - 1) * condition;
  const totalHand = meadows.reduce((n, i) => n + handCut * (i.scale ?? 1), 0);
  const coverage =
    totalHand > 0 && condition > 0
      ? Math.min(1, (TOOL_HOURS_PER_DAY * toolScale * multiplier) / totalHand)
      : 0;
  return meadows.map((i) => {
    const scale = i.scale ?? 1;
    const toolHours = (handCut * scale * coverage) / multiplier;
    const cuttingHours = handCut * scale * (1 - coverage) + toolHours;
    return {
      instanceId: i.id,
      scytheIds: coverage > 0 ? tools.map((t) => t.id) : [],
      toolHours,
      cuttingHours,
      savedHours: handCut * scale - cuttingHours,
      laborFactor:
        labor.weekly > 0 ? (upkeep + (scale > 0 ? cuttingHours / scale : 0)) / (labor.weekly / 7) : 0,
      rainFactor,
      hay: dailyAmount(hay, day, weather, table) * scale * rainFactor,
    };
  });
}

export function fodderRecords(catalog: Catalog, state: GameState, satisfaction: Map<string, number>) {
  return fodderPlan(catalog, state, state.instances)
    .filter((p) => p.cuttingHours > 0)
    .map((p) => {
      const share = satisfaction.get(p.instanceId) ?? 0;
      return {
        instanceId: p.instanceId,
        scytheIds: p.scytheIds,
        cuttingHours: p.cuttingHours * share,
        toolHours: p.toolHours * share,
        savedHours: p.savedHours * share,
      };
    });
}

export function fodderView(state: GameState, catalog: Catalog, id: string) {
  const inst = state.instances.find((i) => i.id === id);
  const rule = catalog.fodder;
  if (!inst || !rule) return null;
  if (inst.systemId === rule.meadowId) {
    const plan = fodderPlan(catalog, state, state.instances).find((p) => p.instanceId === id);
    const last = state.ledgers.at(-1)?.fodder?.find((p) => p.instanceId === id);
    return {
      text: 'Hay follows the growing season and rainfall. Scythes reduce cutting labor when Tools multiply gathering is enabled; they do not increase the land yield.',
      rain: explained(plan?.rainFactor ?? 0, rule.note),
      cutting: explained(
        last?.cuttingHours ?? 0,
        'measured meadow cutting hours yesterday, after input satisfaction',
      ),
      saved: explained(last?.savedHours ?? 0, 'hand-cut hours avoided yesterday by the shared scythes'),
      capacity: null,
    };
  }
  if (inst.systemId === rule.mixId)
    return {
      text: 'All three ingredients are required. Inputs become chicken feed with a processing loss; grain used here is separate from household meals. Production feeds stock for the next day.',
      rain: null,
      cutting: null,
      saved: null,
      capacity: null,
    };
  if (inst.systemId === rule.barnId) {
    const pool = statePools(state, catalog).find((p) => p.name === 'Feed storage');
    return {
      text: state.settings.storagePools
        ? 'Hay and chicken feed share this dedicated volume plus other free feed storage. Tools cannot occupy barn space.'
        : 'Enable Separate storage and winter water to use the hay/feed pool.',
      rain: null,
      cutting: null,
      saved: null,
      capacity: pool
        ? explained(
            pool.cap,
            'dedicated Feed storage + free general Storage space + household feed bins, cu ft',
          )
        : null,
    };
  }
  return null;
}
