import type { Catalog } from '@homestead/catalog';
import { deleteInstance, insertInstance, moveSystem, type GameState, type Instance } from '@homestead/engine';

/**
 * Undoable design edits. Each command carries what it needs to apply its exact
 * inverse to the *current* state, so undo works while the clock is running
 * (time itself is never undone).
 */
export type Command =
  | { kind: 'place'; instances: Instance[] }
  | { kind: 'remove'; removed: { inst: Instance; index: number; refund: number }[] }
  | { kind: 'move'; moves: { id: string; from: { x: number; y: number }; to: { x: number; y: number } }[] };

export function undoCommand(catalog: Catalog, s: GameState, c: Command): GameState {
  switch (c.kind) {
    case 'place':
      return [...c.instances].reverse().reduce((st, i) => deleteInstance(st, i.id, i.paid), s);
    case 'remove':
      return c.removed.reduce((st, r) => insertInstance(st, r.inst, -r.refund, r.index), s);
    case 'move':
      return c.moves.reduce((st, m) => moveSystem(catalog, st, m.id, m.from.x, m.from.y), s);
  }
}

export function redoCommand(catalog: Catalog, s: GameState, c: Command): GameState {
  switch (c.kind) {
    case 'place':
      return c.instances.reduce((st, i) => insertInstance(st, i, -i.paid), s);
    case 'remove':
      return [...c.removed].reverse().reduce((st, r) => deleteInstance(st, r.inst.id, r.refund), s);
    case 'move':
      return c.moves.reduce((st, m) => moveSystem(catalog, st, m.id, m.to.x, m.to.y), s);
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
  }
}
