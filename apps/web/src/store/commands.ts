import type { ActionBody, Instance } from '@homestead/engine';

/**
 * Undoable design edits. Each command knows the engine actions that apply its
 * exact inverse to the *current* state, so undo works while the clock runs
 * (time itself is never undone) and every undo and redo lands in the action log.
 */
export type Command =
  | { kind: 'place'; instances: Instance[] }
  | { kind: 'remove'; removed: { inst: Instance; index: number; refund: number }[] }
  | { kind: 'move'; moves: { id: string; from: { x: number; y: number }; to: { x: number; y: number } }[] }
  | { kind: 'priority'; id: string; from: number; to: number }
  | { kind: 'link'; id: string; resource: string; from: string | null; to: string | null }
  | { kind: 'settings'; from: Record<string, unknown>; to: Record<string, unknown> };

export function undoActions(c: Command): ActionBody[] {
  switch (c.kind) {
    case 'place':
      return [...c.instances].reverse().map((i) => ({ kind: 'delete', id: i.id, cashDelta: i.paid }));
    case 'remove':
      return c.removed.map((r) => ({
        kind: 'insert',
        instance: r.inst,
        cashDelta: -r.refund,
        index: r.index,
      }));
    case 'move':
      return [{ kind: 'moveMany', moves: c.moves.map((m) => ({ id: m.id, ...m.from })) }];
    case 'priority':
      return [{ kind: 'priority', id: c.id, priority: c.from }];
    case 'link':
      return [{ kind: 'link', id: c.id, resource: c.resource, providerId: c.from }];
    case 'settings':
      return [{ kind: 'settings', settings: c.from }];
  }
}

export function redoActions(c: Command): ActionBody[] {
  switch (c.kind) {
    case 'place':
      return c.instances.map((i) => ({ kind: 'insert', instance: i, cashDelta: -i.paid }));
    case 'remove':
      return [...c.removed].reverse().map((r) => ({ kind: 'delete', id: r.inst.id, cashDelta: r.refund }));
    case 'move':
      return [{ kind: 'moveMany', moves: c.moves.map((m) => ({ id: m.id, ...m.to })) }];
    case 'priority':
      return [{ kind: 'priority', id: c.id, priority: c.to }];
    case 'link':
      return [{ kind: 'link', id: c.id, resource: c.resource, providerId: c.to }];
    case 'settings':
      return [{ kind: 'settings', settings: c.to }];
  }
}

export function describeCommand(c: Command): string {
  switch (c.kind) {
    case 'place':
      return c.instances.length === 1 ? 'placement' : `${c.instances.length} placements`;
    case 'remove':
      return c.removed.length === 1 ? 'removal' : `${c.removed.length} removals`;
    case 'move':
      return c.moves.length === 1 ? 'move' : `${c.moves.length} moves`;
    case 'priority':
      return 'priority change';
    case 'link':
      return 'link change';
    case 'settings':
      return 'settings change';
  }
}
