import { catalog as bundledCatalog, getSite, type Catalog } from '@homestead/catalog';
import {
  canPlace,
  initGame,
  parcelSideFt,
  placeSystem,
  refundFor,
  removeSystem,
  stepDays,
  type BuildMode,
  type GameEvent,
  type GameState,
  type Instance,
} from '@homestead/engine';
import { create } from 'zustand';
import { describeCommand, redoCommand, undoCommand, type Command } from './commands.ts';
import { loadPref, savePref } from './persist.ts';

export type Tool = { kind: 'select' } | { kind: 'place'; systemId: string; mode: BuildMode };
export type Speed = 0 | 1 | 3 | 10;
export type DrawerTab = 'systems' | 'inputs' | 'outputs';

export interface Camera {
  /** World point (ft) at the center of the view. */
  cx: number;
  cy: number;
  /** Screen pixels per foot. */
  zoom: number;
}

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'warn';
}

export interface GameStore {
  catalog: Catalog;
  game: GameState;
  events: GameEvent[];
  tool: Tool;
  selection: string[];
  camera: Camera;
  viewport: { width: number; height: number };
  speed: Speed;
  lastSpeed: Exclude<Speed, 0>;
  snap: 0 | 1 | 5 | 10;
  undoStack: Command[];
  redoStack: Command[];
  clipboard: { systemId: string; buildMode: BuildMode; dx: number; dy: number }[];
  drawerOpen: boolean;
  drawerTab: DrawerTab;
  cardSystemId: string | null;
  highlightResource: string | null;
  toasts: Toast[];

  newGame(game: GameState): void;
  tick(days?: number): void;
  setSpeed(s: Speed): void;
  togglePause(): void;
  startPlacing(systemId: string, mode?: BuildMode): void;
  cancelTool(): void;
  placeAt(x: number, y: number, keepTool?: boolean): { ok: boolean; reason?: string; instanceId?: string };
  select(ids: string[], additive?: boolean): void;
  moveSelection(dx: number, dy: number): boolean;
  deleteSelection(): void;
  copySelection(): void;
  paste(x: number, y: number): void;
  undo(): void;
  redo(): void;
  setCamera(c: Partial<Camera>): void;
  setViewport(width: number, height: number): void;
  zoomToFit(): void;
  setSnap(s: GameStore['snap']): void;
  setDrawer(open: boolean): void;
  setDrawerTab(t: DrawerTab): void;
  openCard(systemId: string | null): void;
  setHighlight(resource: string | null): void;
  toast(text: string, tone?: Toast['tone']): void;
  dismissToast(id: number): void;
}

const MAX_EVENTS = 2000;
let toastId = 1;

/**
 * A new game: two people and a bell tent on an acre of Front Range grass in early April,
 * with about two months of groceries and a few days of drinking water.
 */
export function defaultGame(catalog: Catalog = bundledCatalog): GameState {
  let g = initGame(
    catalog,
    getSite('front-range'),
    { startDay: 90, startingStocks: { Food: 240_000, 'Drinking water': 40 } },
    2026,
  );
  const side = parcelSideFt(g.settings);
  const place = (name: string, x: number, y: number) => {
    const s = catalog.systems.find((x) => x.name === name)!;
    g = placeSystem(catalog, g, s.id, x, y, 'prebuilt').state;
  };
  place('Land Title ($50k)', side / 2, side / 2);
  place('Sunlight', side / 2, side / 2);
  place('Rainfall', side / 2, side / 2);
  place('Bell Tent', side / 2, side / 2 - 30);
  place('Human Being', side / 2 - 6, side / 2 - 8);
  place('Human Being', side / 2 + 6, side / 2 - 8);
  return g;
}

export function snapTo(v: number, step: number): number {
  return step > 0 ? Math.round(v / step) * step : v;
}

export const useGame = create<GameStore>()((set, get) => {
  const initial = defaultGame();
  const side = parcelSideFt(initial.settings);

  const commit = (game: GameState, cmd: Command, extra: Partial<GameStore> = {}) => {
    set((s) => ({ game, undoStack: [...s.undoStack.slice(-199), cmd], redoStack: [], ...extra }));
  };

  return {
    catalog: bundledCatalog,
    game: initial,
    events: [],
    tool: { kind: 'select' },
    selection: [],
    camera: { cx: side / 2, cy: side / 2, zoom: 4 },
    viewport: { width: 1200, height: 800 },
    speed: 0,
    lastSpeed: 1,
    snap: 1,
    undoStack: [],
    redoStack: [],
    clipboard: [],
    drawerOpen: loadPref('drawerOpen', true),
    drawerTab: loadPref<DrawerTab>('drawerTab', 'systems'),
    cardSystemId: null,
    highlightResource: null,
    toasts: [],

    newGame(game) {
      set({ game, events: [], selection: [], undoStack: [], redoStack: [], tool: { kind: 'select' } });
      get().zoomToFit();
    },

    tick(days = 1) {
      const { game, catalog, events } = get();
      const r = stepDays(game, catalog, days);
      const next = r.events.length ? [...events, ...r.events].slice(-MAX_EVENTS) : events;
      set({ game: r.state, events: next });
    },

    setSpeed(speed) {
      set((s) => ({ speed, lastSpeed: speed === 0 ? s.lastSpeed : speed }));
    },

    togglePause() {
      const s = get();
      s.setSpeed(s.speed === 0 ? s.lastSpeed : 0);
    },

    startPlacing(systemId, mode = 'buy') {
      set({ tool: { kind: 'place', systemId, mode }, selection: [] });
    },

    cancelTool() {
      set({ tool: { kind: 'select' } });
    },

    placeAt(x, y, keepTool = false) {
      const { tool, game, catalog, snap } = get();
      if (tool.kind !== 'place') return { ok: false, reason: 'Nothing to place' };
      const px = snapTo(x, snap);
      const py = snapTo(y, snap);
      const check = canPlace(catalog, game, tool.systemId, px, py);
      if (!check.ok) return { ok: false, reason: check.reason };
      const r = placeSystem(catalog, game, tool.systemId, px, py, tool.mode);
      const inst = r.state.instances.find((i) => i.id === r.instanceId)!;
      commit(
        r.state,
        { kind: 'place', instances: [inst] },
        keepTool ? {} : { tool: { kind: 'select' }, selection: [inst.id] },
      );
      return { ok: true, instanceId: r.instanceId };
    },

    select(ids, additive = false) {
      set((s) => {
        if (!additive) return { selection: ids };
        const cur = new Set(s.selection);
        for (const id of ids) {
          if (cur.has(id)) cur.delete(id);
          else cur.add(id);
        }
        return { selection: [...cur] };
      });
    },

    moveSelection(dx, dy) {
      const { selection, game, catalog, snap } = get();
      if (!selection.length || (dx === 0 && dy === 0)) return false;
      let s = game;
      const moves: Extract<Command, { kind: 'move' }>['moves'] = [];
      for (const id of selection) {
        const inst = s.instances.find((i) => i.id === id);
        if (!inst) continue;
        const to = { x: snapTo(inst.x + dx, snap), y: snapTo(inst.y + dy, snap) };
        const check = canPlace(catalog, s, inst.systemId, to.x, to.y, selection);
        if (!check.ok) {
          get().toast(check.reason, 'warn');
          return false;
        }
        moves.push({ id, from: { x: inst.x, y: inst.y }, to });
      }
      for (const m of moves)
        s = { ...s, instances: s.instances.map((i) => (i.id === m.id ? { ...i, ...m.to } : i)) };
      commit(s, { kind: 'move', moves });
      return true;
    },

    deleteSelection() {
      const { selection, game } = get();
      if (!selection.length) return;
      let s = game;
      const removed: Extract<Command, { kind: 'remove' }>['removed'] = [];
      for (const id of selection) {
        const index = s.instances.findIndex((i) => i.id === id);
        if (index < 0) continue;
        const inst = s.instances[index]!;
        removed.push({ inst, index, refund: refundFor(inst) });
        s = removeSystem(s, id);
      }
      commit(s, { kind: 'remove', removed }, { selection: [] });
    },

    copySelection() {
      const { selection, game } = get();
      const insts = game.instances.filter((i) => selection.includes(i.id));
      if (!insts.length) return;
      const cx = insts.reduce((a, i) => a + i.x, 0) / insts.length;
      const cy = insts.reduce((a, i) => a + i.y, 0) / insts.length;
      set({
        clipboard: insts.map((i) => ({
          systemId: i.systemId,
          buildMode: i.buildMode === 'prebuilt' ? 'buy' : i.buildMode,
          dx: i.x - cx,
          dy: i.y - cy,
        })),
      });
    },

    paste(x, y) {
      const { clipboard, game, catalog, snap } = get();
      if (!clipboard.length) return;
      let s = game;
      const placed: Instance[] = [];
      for (const c of clipboard) {
        const px = snapTo(x + c.dx, snap);
        const py = snapTo(y + c.dy, snap);
        if (!canPlace(catalog, s, c.systemId, px, py).ok) continue;
        const r = placeSystem(catalog, s, c.systemId, px, py, c.buildMode);
        s = r.state;
        placed.push(s.instances.find((i) => i.id === r.instanceId)!);
      }
      if (!placed.length) {
        get().toast('No room to paste here', 'warn');
        return;
      }
      commit(s, { kind: 'place', instances: placed }, { selection: placed.map((i) => i.id) });
    },

    undo() {
      const { undoStack, game, catalog } = get();
      const cmd = undoStack.at(-1);
      if (!cmd) return;
      try {
        const s = undoCommand(catalog, game, cmd);
        set((st) => ({
          game: s,
          undoStack: st.undoStack.slice(0, -1),
          redoStack: [...st.redoStack, cmd],
          selection: [],
        }));
      } catch {
        get().toast(`Can't undo the ${describeCommand(cmd)}: something is in the way`, 'warn');
      }
    },

    redo() {
      const { redoStack, game, catalog } = get();
      const cmd = redoStack.at(-1);
      if (!cmd) return;
      try {
        const s = redoCommand(catalog, game, cmd);
        set((st) => ({ game: s, redoStack: st.redoStack.slice(0, -1), undoStack: [...st.undoStack, cmd] }));
      } catch {
        get().toast(`Can't redo the ${describeCommand(cmd)}: something is in the way`, 'warn');
      }
    },

    setCamera(c) {
      set((s) => ({
        camera: { ...s.camera, ...c, zoom: Math.min(40, Math.max(0.3, c.zoom ?? s.camera.zoom)) },
      }));
    },

    setViewport(width, height) {
      set({ viewport: { width, height } });
    },

    zoomToFit() {
      const { game, viewport } = get();
      const side = parcelSideFt(game.settings);
      const zoom = Math.min(viewport.width, viewport.height) / (side * 1.1);
      get().setCamera({ cx: side / 2, cy: side / 2, zoom });
    },

    setSnap(snap) {
      set({ snap });
    },

    setDrawer(open) {
      savePref('drawerOpen', open);
      set({ drawerOpen: open });
    },

    setDrawerTab(t) {
      savePref('drawerTab', t);
      set({ drawerTab: t });
    },

    openCard(systemId) {
      set({ cardSystemId: systemId });
    },

    setHighlight(resource) {
      set({ highlightResource: resource });
    },

    toast(text, tone = 'info') {
      const id = toastId++;
      set((s) => ({ toasts: [...s.toasts.slice(-4), { id, text, tone }] }));
      setTimeout(() => get().dismissToast(id), 4000);
    },

    dismissToast(id) {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    },
  };
});

/** Screen ↔ world conversion for the current camera. */
export function worldToScreen(c: Camera, v: { width: number; height: number }, x: number, y: number) {
  return { x: (x - c.cx) * c.zoom + v.width / 2, y: (y - c.cy) * c.zoom + v.height / 2 };
}

export function screenToWorld(c: Camera, v: { width: number; height: number }, sx: number, sy: number) {
  return { x: (sx - v.width / 2) / c.zoom + c.cx, y: (sy - v.height / 2) / c.zoom + c.cy };
}
