import type { Catalog, QuestStep } from '@homestead/catalog';
import {
  applyAction,
  costFor,
  findSpot,
  nodePosition,
  parcelSideFt,
  type Action,
  type ActionBody,
  type GameState,
} from '@homestead/engine';

const idOf = (catalog: Catalog, name: string): string => {
  const s = catalog.systems.find((x) => x.name === name);
  if (!s) throw new Error(`No system named "${name}"`);
  return s.id;
};

/** Where "near" points: the home (first shelter), a node type, or a placed system by name. */
function anchor(catalog: Catalog, state: GameState, near: string): { x: number; y: number } {
  const side = parcelSideFt(state.settings);
  if (near === 'home') {
    const shelterIds = new Set(
      catalog.flows.filter((f) => f.direction === 'out' && f.resource === 'Shelter').map((f) => f.systemId),
    );
    const h = state.instances.find((i) => shelterIds.has(i.systemId));
    return h ? { x: h.x, y: h.y } : { x: side / 2, y: side / 2 };
  }
  if (near.startsWith('node:')) {
    const n = state.site.nodes.find((x) => x.type === near.slice(5));
    if (n) return nodePosition(state, n);
  }
  const inst = state.instances.find((i) => i.systemId === catalog.systems.find((s) => s.name === near)?.id);
  return inst ? { x: inst.x, y: inst.y } : { x: side / 2, y: side / 2 };
}

/**
 * Turn one quest step into actions (what a player would click), applying each so the next
 * one sees the new state. Steps that can't be done (no money, no room) are skipped and named.
 */
export function doStep(
  catalog: Catalog,
  state: GameState,
  step: QuestStep,
  log: Action[],
  skipped: string[],
): GameState {
  const apply = (body: ActionBody): void => {
    const a = { ...body, at: state.calendar.absDay } as Action;
    try {
      state = applyAction(catalog, state, a);
      log.push(a);
    } catch (e) {
      skipped.push(`${body.kind}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  switch (step.do) {
    case 'place': {
      const id = idOf(catalog, step.system);
      for (let k = 0; k < step.count; k++) {
        const cost = costFor(catalog, id, step.mode);
        if (cost > state.cash) {
          skipped.push(`${step.system}: not enough cash`);
          return state;
        }
        const at = anchor(catalog, state, step.near);
        const spot = step.on ? at : findSpot(catalog, state, id, at.x + 12, at.y + 12);
        if (!spot) {
          skipped.push(`${step.system}: no room`);
          return state;
        }
        apply({ kind: 'place', systemId: id, x: spot.x, y: spot.y, mode: step.mode, id: `i${state.nextInstanceId}` });
      }
      return state;
    }
    case 'remove': {
      const id = idOf(catalog, step.system);
      const all = state.instances.filter((x) => x.systemId === id);
      for (const i of all.slice(0, step.count ?? all.length)) apply({ kind: 'remove', id: i.id });
      return state;
    }
    case 'priority': {
      const id = idOf(catalog, step.system);
      for (const i of state.instances.filter((x) => x.systemId === id)) apply({ kind: 'priority', id: i.id, priority: step.tier });
      return state;
    }
    case 'buy':
      apply({ kind: 'buy', resource: step.resource, amount: step.amount });
      return state;
    case 'standing':
      apply({ kind: 'standing', resource: step.resource, keepAbove: step.keepAbove, orderUpTo: step.orderUpTo });
      return state;
    case 'autoGather': {
      const { do: _d, ...rules } = step;
      apply({ kind: 'settings', settings: { autoGather: { ...(state.settings.autoGather ?? {}), ...rules } } });
      return state;
    }
    case 'workCap': {
      const w = state.settings.work ?? {};
      apply({ kind: 'settings', settings: { work: { ...w, caps: { ...(w.caps ?? {}), [step.job]: step.hours } } } });
      return state;
    }
    case 'open':
      apply({ kind: 'ui', panel: step.panel });
      return state;
  }
}
