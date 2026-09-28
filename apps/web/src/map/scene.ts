import type { Application } from 'pixi.js';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Catalog, System } from '@homestead/catalog';
import {
  canPlace,
  computeSpatial,
  FLOW_GROUPS,
  flowLinks,
  footprintSideFt,
  getSystem,
  nextRandom,
  parcelSideFt,
  seasonOf,
  type FlowGroup,
  type FlowLink,
  type GameState,
} from '@homestead/engine';
import { personTexture, systemTexture } from '../sprites/placeholder.ts';
import { screenToWorld, snapTo, useGame, type GameStore } from '../store/game.ts';
import { bakeTiled, grassTexture, SEASON_TINT, snowTexture } from './grass.ts';

export const FLOW_COLORS: Record<FlowGroup, number> = {
  water: 0x4f93c9,
  power: 0xf2c641,
  food: 0x8fd35a,
  heat: 0xe0803d,
  waste: 0xa67c52,
  labor: 0xe8dcc0,
};
export const FLOW_SHORT = 0xe0523d;
/** Colorblind-safe "short" (orange against the blue/yellow flows). */
export const FLOW_SHORT_CB = 0xff8c1a;

/** Minimum on-screen size for tiny systems, in feet (a filter is still clickable). */
const MIN_VISUAL_FT = 3;
const PERSON_FT = 5;

interface InstanceView {
  id: string;
  systemId: string;
  root: Container;
  sprite: Sprite;
  scaffold: Graphics | null;
  ring: Graphics | null;
  selected: Graphics;
  lastProgress: number;
}

interface Walker {
  id: string;
  sprite: Sprite;
  x: number;
  y: number;
  tx: number;
  ty: number;
  wait: number;
  rng: number;
  phase: number;
  crate?: Graphics;
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; cx: number; cy: number }
  | { kind: 'move'; wx: number; wy: number; dx: number; dy: number; moved: boolean }
  | { kind: 'box'; sx: number; sy: number; ex: number; ey: number; additive: boolean }
  | null;

/**
 * The PixiJS playfield. Owns no game state: it renders the store and turns
 * pointer input into store actions. One world unit = one foot.
 */
export class MapScene {
  readonly app: Application;
  private catalog: Catalog;
  private world = new Container();
  private grass!: Sprite;
  private snow!: Sprite;
  private parcel = new Graphics();
  private terrain = new Container();
  private ground = new Container();
  private objects = new Container();
  private peopleLayer = new Container();
  private overlay = new Container();
  private ghost = new Container();
  private ghostSprite = new Sprite();
  private ghostOutline = new Graphics();
  private boxGfx = new Graphics();
  /** Dawn and dusk light over the whole view (1× only, never with reduced motion). */
  private light = new Graphics();
  private highlight = new Graphics();
  /** Effect radius and assigned-capacity links for the selected system. */
  private spatialGfx = new Graphics();
  private flowLines = new Graphics();
  private flowDots = new Graphics();
  private links: { link: FlowLink; color: number; width: number; len: number }[] = [];
  private views = new Map<string, InstanceView>();
  private walkers = new Map<string, Walker>();
  private pointer = { sx: 0, sy: 0, wx: 0, wy: 0, inside: false };
  private drag: Drag = null;
  private pinch = new Map<number, { x: number; y: number }>();
  private pinchStart: { dist: number; zoom: number } | null = null;
  private unsub: () => void;
  private lastGame: GameState | null = null;
  private lastSeason = '';
  hovered: string | null = null;
  onHover: (id: string | null, sx: number, sy: number) => void = () => {};
  private pops: { root: Container; t0: number }[] = [];
  private floats: { g: Graphics; t0: number; x: number; y: number }[] = [];
  /** Absolute day of the last harvest: people carry crates for a few days after. */
  private lastHarvestDay = -99;
  /** Frame timestamps (ms) for the performance test hook. */
  frameTimes: number[] = [];
  /** Milliseconds of scene work per frame (camera, people), for the performance test hook. */
  frameWork: number[] = [];

  constructor(app: Application, catalog: Catalog) {
    this.app = app;
    this.catalog = catalog;
    this.grass = new Sprite(bakeTiled(grassTexture(), 'grass', 8));
    this.snow = new Sprite(bakeTiled(snowTexture(), 'snow', 8));
    this.snow.visible = false;
    this.world.addChild(this.grass, this.snow, this.parcel, this.terrain, this.ground, this.objects);
    this.world.addChild(
      this.peopleLayer,
      this.highlight,
      this.flowLines,
      this.flowDots,
      this.overlay,
      this.ghost,
    );
    this.ghost.addChild(this.ghostSprite, this.ghostOutline);
    this.ghostSprite.anchor.set(0.5);
    this.ghost.visible = false;
    app.stage.addChild(this.world, this.light, this.boxGfx);

    this.unsub = useGame.subscribe((s, prev) => this.onStore(s, prev));
    this.onStore(useGame.getState(), null);
    app.ticker.add(() => this.frame());
    this.bindInput();
  }

  destroy(): void {
    this.unsub();
    this.unbindInput();
  }

  // --- Store → scene --------------------------------------------------------

  private onStore(s: GameStore, prev: GameStore | null): void {
    if (!prev || s.game !== prev.game) this.syncGame(s.game);
    if (!prev || s.selection !== prev.selection || s.game !== prev.game) {
      this.syncSelection(s.selection);
      this.syncSpatial(s);
    }
    if (!prev || s.highlightResource !== prev.highlightResource || s.game !== prev.game)
      this.syncHighlight(s);
    if (!prev || s.tool !== prev.tool) this.syncTool(s);
    if (prev && s.kbCursor !== prev.kbCursor) this.updateGhost();
    if (prev && s.events !== prev.events) this.onEvents(s, prev);
    if (!prev || s.overlay !== prev.overlay || s.game !== prev.game || s.selection !== prev.selection)
      this.syncFlows(s);
  }

  /** Recompute overlay links from yesterday's engine results. */
  private syncFlows(s: GameStore): void {
    const lines = this.flowLines.clear();
    this.links = [];
    if (!s.overlay.on) {
      this.flowDots.clear();
      return;
    }
    const byRes = new Map<string, number>();
    const groupOf = new Map<string, FlowGroup>();
    for (const g of s.overlay.groups) for (const r of FLOW_GROUPS[g].resources) groupOf.set(r, g);
    const links = flowLinks(s.game, this.catalog, {
      resources: [...groupOf.keys()],
      ...(s.selection.length === 1 ? { instanceId: s.selection[0]! } : {}),
      maxLinks: 250,
    });
    for (const l of links) byRes.set(l.resource, Math.max(byRes.get(l.resource) ?? 0, l.amount));
    const pos = new Map(s.game.instances.map((i) => [i.id, i]));
    for (const l of links) {
      const a = pos.get(l.from);
      const b = pos.get(l.to);
      if (!a || !b) continue;
      const short = s.prefs.colorblind ? FLOW_SHORT_CB : FLOW_SHORT;
      const color: number = l.short ? short : FLOW_COLORS[groupOf.get(l.resource) ?? 'water'];
      const max = byRes.get(l.resource) || 1;
      const width = 0.5 + 2.5 * Math.sqrt(l.amount / max);
      if (l.from === l.to) {
        // A consumer with no producer at all: a dashed red ring.
        for (let k = 0; k < 12; k += 2) {
          lines
            .arc(b.x, b.y, 6, (k * Math.PI) / 6, ((k + 1) * Math.PI) / 6)
            .stroke({ width: 1, color: FLOW_SHORT });
        }
        continue;
      }
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (l.short) {
        // Red dashes where the consumer is short.
        const dash = 3;
        for (let d = 0; d < len; d += dash * 2) {
          const t0 = d / len;
          const t1 = Math.min(1, (d + dash) / len);
          lines
            .moveTo(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0)
            .lineTo(a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1)
            .stroke({ width, color, alpha: 0.85 });
        }
      } else {
        lines.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width, color, alpha: 0.45 });
      }
      this.links.push({ link: l, color, width, len });
    }
  }

  /** New harvests float a little crop mark up from the plants (not with reduced motion). */
  private onEvents(s: GameStore, prev: GameStore): void {
    const fresh = s.events.slice(prev.events.length > s.events.length ? 0 : prev.events.length);
    for (const e of fresh) {
      if (e.kind !== 'harvest') continue;
      this.lastHarvestDay = e.absDay;
      if (s.prefs.reducedMotion) continue;
      for (const id of e.instanceIds.slice(0, 12)) {
        const inst = s.game.instances.find((i) => i.id === id);
        if (!inst) continue;
        const g = new Graphics();
        g.circle(0, 0, 2.2).fill({ color: 0xf2c641 });
        g.circle(-0.7, -0.7, 0.8).fill({ color: 0xffffff, alpha: 0.7 });
        this.overlay.addChild(g);
        this.floats.push({ g, t0: performance.now(), x: inst.x, y: inst.y });
      }
    }
  }

  private animateFeel(now: number): void {
    this.pops = this.pops.filter((p) => {
      if (p.root.destroyed) return false;
      const t = Math.min(1, (now - p.t0) / 220);
      const k = 1 - (1 - t) ** 3;
      p.root.scale.set(0.4 + 0.6 * k + Math.sin(t * Math.PI) * 0.12);
      if (t >= 1) p.root.scale.set(1);
      return t < 1;
    });
    this.floats = this.floats.filter((f) => {
      const t = (now - f.t0) / 1200;
      f.g.position.set(f.x, f.y - t * 12);
      f.g.alpha = Math.max(0, 1 - t);
      if (t >= 1) f.g.destroy();
      return t < 1;
    });
    // People carry crates for three days after a harvest.
    const carrying = useGame.getState().game.calendar.absDay - this.lastHarvestDay <= 3;
    for (const w of this.walkers.values()) {
      if (carrying && !w.crate) {
        w.crate = new Graphics().rect(-1, -3.2, 2, 1.4).fill({ color: 0x9a6b3a }).stroke({ width: 0.2, color: 0x3a2a18 });
        w.sprite.parent?.addChild(w.crate);
      }
      if (w.crate) {
        w.crate.visible = carrying;
        w.crate.position.set(w.sprite.x, w.sprite.y);
      }
    }
  }

  /** Warm light at dawn, dusk blue at the end of each day; only at 1× and never with reduced motion. */
  private drawLight(s: GameStore, now: number): void {
    const g = this.light.clear();
    if (s.speed !== 1 || s.prefs.reducedMotion || !s.lastTickAt) return;
    const phase = Math.min(1, Math.max(0, (now - s.lastTickAt) / 1000));
    let color = 0;
    let alpha = 0;
    if (phase < 0.18) {
      color = 0xffa05a;
      alpha = 0.16 * (1 - phase / 0.18);
    } else if (phase > 0.8) {
      color = 0x2b3170;
      alpha = 0.22 * ((phase - 0.8) / 0.2);
    }
    if (alpha > 0.005) g.rect(0, 0, s.viewport.width, s.viewport.height).fill({ color, alpha });
  }

  /** Moving dots along overlay links show direction (producer → consumer). */
  private animateFlows(still = false): void {
    const g = this.flowDots.clear();
    if (!this.links.length) return;
    const s = useGame.getState();
    const pos = new Map(s.game.instances.map((i) => [i.id, i]));
    const t = still ? 0 : performance.now() / 1000;
    const spacing = 12;
    for (const { link, color, width, len } of this.links) {
      if (len < 1) continue;
      const a = pos.get(link.from)!;
      const b = pos.get(link.to)!;
      const offset = (t * 10) % spacing;
      for (let d = offset; d < len; d += spacing) {
        const k = d / len;
        g.circle(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, Math.max(0.6, width * 0.6)).fill({ color });
      }
    }
  }

  private syncGame(g: GameState): void {
    const side = parcelSideFt(g.settings);
    if (!this.lastGame || parcelSideFt(this.lastGame.settings) !== side || this.lastGame.site !== g.site) {
      this.drawParcel(side, g);
    }
    const season = seasonOf(g.calendar.day);
    if (season !== this.lastSeason) {
      this.grass.tint = SEASON_TINT[season];
      this.snow.visible = season === 'winter';
      this.snow.alpha = 0.55;
      this.lastSeason = season;
    }
    const seen = new Set<string>();
    for (const inst of g.instances) {
      const sys = getSystem(this.catalog, inst.systemId);
      if (sys.name === 'Human Being') {
        seen.add(inst.id);
        this.syncWalker(inst.id, inst.x, inst.y);
        continue;
      }
      if (sys.layer === 'none') continue;
      seen.add(inst.id);
      let v = this.views.get(inst.id);
      if (!v) {
        v = this.createView(inst.id, sys);
        this.views.set(inst.id, v);
      }
      v.root.position.set(inst.x, inst.y);
      const building = inst.status === 'building';
      const progress = inst.setupHoursNeeded > 0 ? inst.setupHoursDone / inst.setupHoursNeeded : 1;
      if (building && (!v.scaffold || Math.abs(progress - v.lastProgress) > 0.005))
        this.drawConstruction(v, sys, progress);
      if (!building && v.scaffold) {
        v.scaffold.destroy();
        v.ring?.destroy();
        v.scaffold = null;
        v.ring = null;
        v.sprite.alpha = 1;
      }
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        v.root.destroy({ children: true });
        this.views.delete(id);
      }
    }
    for (const [id, w] of this.walkers) {
      if (!seen.has(id)) {
        w.sprite.destroy();
        this.walkers.delete(id);
      }
    }
    this.lastGame = g;
  }

  private drawParcel(side: number, g: GameState): void {
    const margin = Math.max(120, side * 0.6);
    for (const layer of [this.grass, this.snow]) {
      layer.position.set(-margin, -margin);
      layer.width = side + margin * 2;
      layer.height = side + margin * 2;
    }
    const p = this.parcel.clear();
    // Darken everything outside the parcel; a soft double line marks the boundary.
    const shade = { color: 0x1d2a14, alpha: 0.35 };
    p.rect(-margin, -margin, side + margin * 2, margin).fill(shade);
    p.rect(-margin, side, side + margin * 2, margin).fill(shade);
    p.rect(-margin, 0, margin, side).fill(shade);
    p.rect(side, 0, margin, side).fill(shade);
    p.rect(0, 0, side, side).stroke({ width: 2.5, color: 0xfff4d6, alpha: 0.35 });
    p.rect(-1.5, -1.5, side + 3, side + 3).stroke({ width: 1, color: 0x1d2a14, alpha: 0.5 });
    // Terrain: the site's stream and existing trees (read-only).
    this.terrain.removeChildren().forEach((c) => c.destroy());
    const t = g.site.terrain;
    if (t.stream && t.stream.points.length > 1) {
      const s = new Graphics();
      const pts = t.stream.points.map(([x, y]) => [x * side, y * side] as const);
      s.moveTo(pts[0]![0], pts[0]![1]);
      for (const [x, y] of pts.slice(1)) s.lineTo(x, y);
      s.stroke({ width: t.stream.widthFt, color: 0x4f93c9, alpha: 0.85, cap: 'round', join: 'round' });
      this.terrain.addChild(s);
    }
    for (const tree of t.existingTrees) {
      const tr = new Graphics();
      tr.circle(2, 3, 14).fill({ color: 0x000000, alpha: 0.18 });
      tr.circle(0, 0, 14).fill({ color: 0x2f5e2a });
      tr.circle(-4, -4, 7).fill({ color: 0x3f7a36, alpha: 0.9 });
      tr.position.set(tree.x * side, tree.y * side);
      this.terrain.addChild(tr);
    }
  }

  private visualSide(sys: System): number {
    return Math.max(MIN_VISUAL_FT, footprintSideFt(sys.footprintSqft));
  }

  private createView(id: string, sys: System): InstanceView {
    const root = new Container();
    const sprite = new Sprite(systemTexture(this.app.renderer, sys));
    sprite.anchor.set(0.5);
    const side = this.visualSide(sys);
    sprite.width = side;
    sprite.height = side;
    const selected = new Graphics();
    selected.visible = false;
    root.addChild(sprite, selected);
    (sys.layer === 'ground' ? this.ground : this.objects).addChild(root);
    if (this.lastGame && !useGame.getState().prefs.reducedMotion) {
      root.scale.set(0.4);
      this.pops.push({ root, t0: performance.now() });
    }
    return { id, systemId: sys.id, root, sprite, scaffold: null, ring: null, selected, lastProgress: -1 };
  }

  private drawConstruction(v: InstanceView, sys: System, progress: number): void {
    const side = this.visualSide(sys);
    const h = side / 2;
    v.sprite.alpha = 0.45;
    if (!v.scaffold) {
      v.scaffold = new Graphics();
      // Scaffolding: a frame with cross braces.
      const w = Math.max(0.25, side / 40);
      v.scaffold.rect(-h, -h, side, side).stroke({ width: w * 2, color: 0x8a6b3a });
      for (let k = 0; k <= 4; k++) {
        const x = -h + (side * k) / 4;
        v.scaffold.moveTo(x, -h).lineTo(x, h).stroke({ width: w, color: 0x8a6b3a, alpha: 0.8 });
      }
      v.scaffold
        .moveTo(-h, -h)
        .lineTo(h, h)
        .moveTo(h, -h)
        .lineTo(-h, h)
        .stroke({ width: w, color: 0x8a6b3a, alpha: 0.6 });
      v.ring = new Graphics();
      v.root.addChild(v.scaffold, v.ring);
    }
    const r = Math.max(1.2, Math.min(side * 0.3, 8));
    const ring = v.ring!.clear();
    ring.circle(0, 0, r).fill({ color: 0x1c1a14, alpha: 0.55 });
    ring.circle(0, 0, r).stroke({ width: r * 0.28, color: 0xffffff, alpha: 0.25 });
    if (progress > 0) {
      ring
        .arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, progress))
        .stroke({ width: r * 0.28, color: 0xf2c641 });
    }
    v.lastProgress = progress;
  }

  private syncWalker(id: string, x: number, y: number): void {
    let w = this.walkers.get(id);
    if (w) return;
    const seed = [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const sprite = new Sprite(personTexture(this.app.renderer, seed % 6));
    sprite.anchor.set(0.5, 0.8);
    sprite.width = PERSON_FT;
    sprite.height = PERSON_FT;
    this.peopleLayer.addChild(sprite);
    w = { id, sprite, x, y, tx: x, ty: y, wait: 0, rng: seed, phase: 0 };
    this.walkers.set(id, w);
  }

  private syncSelection(ids: string[]): void {
    const set = new Set(ids);
    for (const v of this.views.values()) {
      const on = set.has(v.id);
      v.selected.visible = on;
      if (on) {
        const sys = getSystem(this.catalog, v.systemId);
        const h = this.visualSide(sys) / 2 + 1;
        v.selected
          .clear()
          .rect(-h, -h, h * 2, h * 2)
          .stroke({ width: 1.2, color: 0xfff4d6 });
        v.selected
          .rect(-h - 0.6, -h - 0.6, h * 2 + 1.2, h * 2 + 1.2)
          .stroke({ width: 0.5, color: 0x1c1a14, alpha: 0.6 });
      }
    }
  }

  /** For one selected system: the radius of effects it projects and the provider it is linked to. */
  private syncSpatial(s: GameStore): void {
    const g = this.spatialGfx.clear();
    if (s.selection.length !== 1) return;
    const inst = s.game.instances.find((i) => i.id === s.selection[0]);
    if (!inst) return;
    const sys = getSystem(this.catalog, inst.systemId);
    const half = footprintSideFt(sys.footprintSqft) / 2;
    const radii = new Set<number>();
    for (const r of this.catalog.adjacencyRules) {
      const src = r.from.startsWith('category:')
        ? sys.categories.includes(r.from.slice(9))
        : r.from === sys.id;
      if (src) radii.add(r.radiusFt);
    }
    for (const r of radii) {
      g.roundRect(inst.x - half - r, inst.y - half - r, (half + r) * 2, (half + r) * 2, r)
        .fill({ color: 0xfff4d6, alpha: 0.05 })
        .stroke({ width: 0.8, color: 0xfff4d6, alpha: 0.6 });
    }
    const sp = computeSpatial(this.catalog, s.game).get(inst.id);
    for (const a of Object.values(sp?.assigned ?? {})) {
      const p = a.providerId ? s.game.instances.find((i) => i.id === a.providerId) : null;
      if (!p) continue;
      g.moveTo(inst.x, inst.y).lineTo(p.x, p.y).stroke({ width: 1.2, color: 0x8fd3ff, alpha: 0.9 });
      g.circle(p.x, p.y, 2).fill({ color: 0x8fd3ff });
    }
  }

  private syncHighlight(s: GameStore): void {
    const g = this.highlight.clear();
    const res = s.highlightResource;
    if (!res) return;
    const producers = new Set<string>();
    const consumers = new Set<string>();
    for (const f of this.catalog.flows) {
      if (f.resource !== res) continue;
      (f.direction === 'out' ? producers : consumers).add(f.systemId);
    }
    for (const inst of s.game.instances) {
      const sys = getSystem(this.catalog, inst.systemId);
      if (sys.layer === 'none') continue;
      const isP = producers.has(sys.id);
      const isC = consumers.has(sys.id);
      if (!isP && !isC) continue;
      const h = this.visualSide(sys) / 2 + 2;
      g.roundRect(inst.x - h, inst.y - h, h * 2, h * 2, 2).stroke({
        width: 1.6,
        color: isP ? 0x7ed957 : 0xf2a93b,
      });
    }
  }

  private syncTool(s: GameStore): void {
    if (s.tool.kind !== 'place') {
      this.ghost.visible = false;
      return;
    }
    const sys = getSystem(this.catalog, s.tool.systemId);
    this.ghostSprite.texture = sys.layer === 'none' ? Texture.EMPTY : systemTexture(this.app.renderer, sys);
    const side = this.visualSide(sys);
    this.ghostSprite.width = side;
    this.ghostSprite.height = side;
    this.ghostSprite.alpha = 0.7;
    this.ghost.visible = this.pointer.inside;
    this.updateGhost();
  }

  private updateGhost(): void {
    const s = useGame.getState();
    const kb = s.kbCursor;
    if (s.tool.kind !== 'place' || (!this.pointer.inside && !kb)) {
      this.ghost.visible = false;
      return;
    }
    const sys = getSystem(this.catalog, s.tool.systemId);
    const x = snapTo(kb ? kb.x : this.pointer.wx, s.prefs.snap);
    const y = snapTo(kb ? kb.y : this.pointer.wy, s.prefs.snap);
    const ok = canPlace(this.catalog, s.game, sys.id, x, y).ok;
    this.ghost.visible = true;
    this.ghost.position.set(x, y);
    const real = footprintSideFt(sys.footprintSqft);
    const h = Math.max(real, 1) / 2;
    const cb = s.prefs.colorblind;
    const color = ok ? (cb ? 0x3aa0ff : 0x7ed957) : cb ? 0xff8c1a : 0xe0523d;
    this.ghostOutline
      .clear()
      .rect(-h, -h, h * 2, h * 2)
      .fill({ color, alpha: 0.25 })
      .stroke({ width: 1, color });
    this.ghostSprite.tint = ok ? 0xffffff : 0xff9a8a;
  }

  // --- Frame ------------------------------------------------------------------

  private frame(): void {
    const now = performance.now();
    this.frameTimes.push(now);
    if (this.frameTimes.length > 240) this.frameTimes.shift();
    const s = useGame.getState();
    const { camera: c, viewport: v } = s;
    this.world.scale.set(c.zoom);
    this.world.position.set(v.width / 2 - c.cx * c.zoom, v.height / 2 - c.cy * c.zoom);
    if (!s.prefs.reducedMotion) this.animatePeople(s, this.app.ticker.deltaMS / 1000);
    this.animateFeel(now);
    if (s.overlay.on) this.animateFlows(s.prefs.reducedMotion);
    this.drawLight(s, now);
    this.frameWork.push(performance.now() - now);
    if (this.frameWork.length > 240) this.frameWork.shift();
  }

  /** Cosmetic seeded random walk between the systems people tend. */
  private animatePeople(s: GameStore, dt: number): void {
    if (!this.walkers.size) return;
    const targets = s.game.instances.filter((i) => getSystem(this.catalog, i.systemId).layer === 'object');
    const side = parcelSideFt(s.game.settings);
    const running = s.speed > 0;
    for (const w of this.walkers.values()) {
      if (w.wait > 0) {
        w.wait -= dt * (running ? s.speed : 0.5);
      } else {
        const dx = w.tx - w.x;
        const dy = w.ty - w.y;
        const d = Math.hypot(dx, dy);
        const speed = 4 * (running ? Math.min(3, s.speed) : 1); // ft/s
        if (d < 0.5) {
          let r: number;
          [r, w.rng] = nextRandom(w.rng);
          let r2: number;
          [r2, w.rng] = nextRandom(w.rng);
          const pick = targets.length ? targets[Math.floor(r * targets.length)]! : null;
          const jitter = (r2 - 0.5) * 10;
          w.tx = Math.min(side - 2, Math.max(2, pick ? pick.x + jitter : w.x + jitter * 3));
          w.ty = Math.min(side - 2, Math.max(2, pick ? pick.y + 4 + jitter / 2 : w.y + jitter * 2));
          w.wait = 1 + r2 * 3;
        } else {
          const step = Math.min(d, speed * dt);
          w.x += (dx / d) * step;
          w.y += (dy / d) * step;
          w.phase += dt * 10;
        }
      }
      w.sprite.position.set(w.x, w.y + Math.abs(Math.sin(w.phase)) * -0.3);
    }
  }

  // --- Input --------------------------------------------------------------------

  private listeners: [string, EventListener][] = [];

  private bindInput(): void {
    const el = this.app.canvas;
    const on = (type: string, fn: (e: never) => void) => {
      el.addEventListener(type, fn as EventListener, { passive: false });
      this.listeners.push([type, fn as EventListener]);
    };
    on('pointerdown', (e: PointerEvent) => this.onDown(e));
    on('pointermove', (e: PointerEvent) => this.onMove(e));
    on('pointerup', (e: PointerEvent) => this.onUp(e));
    on('pointercancel', (e: PointerEvent) => this.onUp(e));
    on('pointerleave', () => {
      this.pointer.inside = false;
      this.updateGhost();
      this.setHover(null);
    });
    on('wheel', (e: WheelEvent) => this.onWheel(e));
    on('dblclick', (e: MouseEvent) => {
      const id = this.hit(e);
      if (id) {
        const inst = useGame.getState().game.instances.find((i) => i.id === id);
        if (inst) useGame.getState().openCard(inst.systemId, inst.id);
      }
    });
    on('contextmenu', (e: Event) => e.preventDefault());
  }

  private unbindInput(): void {
    for (const [t, fn] of this.listeners) this.app.canvas.removeEventListener(t, fn);
    this.listeners = [];
  }

  private local(e: { clientX: number; clientY: number }) {
    const r = this.app.canvas.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  }

  private toWorld(sx: number, sy: number) {
    const s = useGame.getState();
    return screenToWorld(s.camera, s.viewport, sx, sy);
  }

  /** Topmost instance under a screen point (objects over ground; people aren't selectable). */
  private hit(e: { clientX: number; clientY: number }): string | null {
    const { sx, sy } = this.local(e);
    const w = this.toWorld(sx, sy);
    const g = useGame.getState().game;
    let best: { id: string; layer: number; area: number } | null = null;
    for (const inst of g.instances) {
      const sys = getSystem(this.catalog, inst.systemId);
      if (sys.layer === 'none') continue;
      const h = this.visualSide(sys) / 2;
      if (Math.abs(w.x - inst.x) > h || Math.abs(w.y - inst.y) > h) continue;
      const layer = sys.layer === 'object' ? 1 : 0;
      const area = h * h;
      if (!best || layer > best.layer || (layer === best.layer && area < best.area))
        best = { id: inst.id, layer, area };
    }
    return best?.id ?? null;
  }

  private setHover(id: string | null): void {
    if (id !== this.hovered) {
      this.hovered = id;
    }
    this.onHover(id, this.pointer.sx, this.pointer.sy);
  }

  private onDown(e: PointerEvent): void {
    this.app.canvas.setPointerCapture(e.pointerId);
    const { sx, sy } = this.local(e);
    this.pinch.set(e.pointerId, { x: sx, y: sy });
    if (this.pinch.size === 2) {
      const [a, b] = [...this.pinch.values()] as [{ x: number; y: number }, { x: number; y: number }];
      this.pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: useGame.getState().camera.zoom };
      this.drag = null;
      return;
    }
    const s = useGame.getState();
    const w = this.toWorld(sx, sy);
    if (e.button === 1 || e.button === 2) {
      this.drag = { kind: 'pan', sx, sy, cx: s.camera.cx, cy: s.camera.cy };
      return;
    }
    if (s.tool.kind === 'place') {
      const r = s.placeAt(w.x, w.y, e.shiftKey);
      if (!r.ok && r.reason) s.toast(r.reason, 'warn');
      this.updateGhost();
      return;
    }
    const id = this.hit(e);
    if (id) {
      if (e.shiftKey) s.select([id], true);
      else if (!s.selection.includes(id)) s.select([id]);
      this.drag = { kind: 'move', wx: w.x, wy: w.y, dx: 0, dy: 0, moved: false };
      return;
    }
    if (e.shiftKey) {
      this.drag = { kind: 'box', sx, sy, ex: sx, ey: sy, additive: true };
      return;
    }
    if (!e.shiftKey) s.select([]);
    this.drag = { kind: 'pan', sx, sy, cx: s.camera.cx, cy: s.camera.cy };
  }

  private onMove(e: PointerEvent): void {
    const { sx, sy } = this.local(e);
    const w = this.toWorld(sx, sy);
    this.pointer = { sx, sy, wx: w.x, wy: w.y, inside: true };
    if (useGame.getState().kbCursor) useGame.getState().setKbCursor(null);
    if (this.pinch.has(e.pointerId)) this.pinch.set(e.pointerId, { x: sx, y: sy });
    if (this.pinch.size === 2 && this.pinchStart) {
      const [a, b] = [...this.pinch.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (this.pinchStart.zoom * dist) / this.pinchStart.dist);
      return;
    }
    const s = useGame.getState();
    const d = this.drag;
    if (d?.kind === 'pan') {
      s.setCamera({ cx: d.cx - (sx - d.sx) / s.camera.zoom, cy: d.cy - (sy - d.sy) / s.camera.zoom });
    } else if (d?.kind === 'move') {
      d.dx = w.x - d.wx;
      d.dy = w.y - d.wy;
      d.moved = d.moved || Math.hypot(d.dx, d.dy) * s.camera.zoom > 3;
      if (d.moved) this.previewMove(d.dx, d.dy);
    } else if (d?.kind === 'box') {
      d.ex = sx;
      d.ey = sy;
      this.boxGfx
        .clear()
        .rect(Math.min(d.sx, sx), Math.min(d.sy, sy), Math.abs(sx - d.sx), Math.abs(sy - d.sy))
        .fill({ color: 0xfff4d6, alpha: 0.12 })
        .stroke({ width: 1, color: 0xfff4d6 });
    } else {
      this.setHover(this.hit(e));
    }
    this.updateGhost();
  }

  private previewMove(dx: number, dy: number): void {
    const s = useGame.getState();
    for (const id of s.selection) {
      const v = this.views.get(id);
      const inst = s.game.instances.find((i) => i.id === id);
      if (v && inst)
        v.root.position.set(snapTo(inst.x + dx, s.prefs.snap), snapTo(inst.y + dy, s.prefs.snap));
    }
  }

  private onUp(e: PointerEvent): void {
    this.pinch.delete(e.pointerId);
    if (this.pinch.size < 2) this.pinchStart = null;
    const d = this.drag;
    this.drag = null;
    const s = useGame.getState();
    if (d?.kind === 'move' && d.moved) {
      const ok = s.moveSelection(d.dx, d.dy);
      if (!ok) this.syncGame(s.game); // snap back
    } else if (d?.kind === 'box') {
      this.boxGfx.clear();
      const a = this.toWorld(Math.min(d.sx, d.ex), Math.min(d.sy, d.ey));
      const b = this.toWorld(Math.max(d.sx, d.ex), Math.max(d.sy, d.ey));
      const ids = s.game.instances
        .filter((i) => getSystem(this.catalog, i.systemId).layer !== 'none')
        .filter((i) => i.x >= a.x && i.x <= b.x && i.y >= a.y && i.y <= b.y)
        .map((i) => i.id);
      s.select(ids, d.additive);
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const { sx, sy } = this.local(e);
    const z = useGame.getState().camera.zoom * Math.exp(-e.deltaY * 0.0015);
    this.zoomAt(sx, sy, z);
  }

  /** Zoom keeping the world point under (sx, sy) fixed. */
  zoomAt(sx: number, sy: number, zoom: number): void {
    const s = useGame.getState();
    const before = screenToWorld(s.camera, s.viewport, sx, sy);
    const z = Math.min(40, Math.max(0.3, zoom));
    const cx = before.x - (sx - s.viewport.width / 2) / z;
    const cy = before.y - (sy - s.viewport.height / 2) / z;
    s.setCamera({ cx, cy, zoom: z });
  }

  /** World point under the pointer (for paste). */
  /** The map as it is drawn now, as a PNG. */
  async snapshotPng(): Promise<Blob> {
    this.app.render();
    const canvas = this.app.renderer.extract.canvas(this.app.stage) as HTMLCanvasElement;
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The map could not be captured'))), 'image/png');
    });
  }

  pointerWorld(): { x: number; y: number } {
    return { x: this.pointer.wx, y: this.pointer.wy };
  }
}
