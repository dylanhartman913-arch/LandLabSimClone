import { getSite, type Catalog } from '@homestead/catalog';
import { getSystem, indexCatalog } from './catalog-index.ts';
import type { DesignFile, DesignPlacement } from './design.ts';
import { initGame, placeDesign, placeSystem, setLink, setPriority } from './time/game.ts';
import type { GameState, WeatherMode } from './time/types.ts';

/** Parcel used when a design file does not name one (the CLI's historical default). */
export const DESIGN_DEFAULT_ACRES = 5;

/**
 * Save the current layout as a design file: counts (for balance mode) and every
 * placement (so time mode, Monte Carlo, and the CLI see the same spatial effects).
 */
export function designFromGame(catalog: Catalog, game: GameState, name: string): DesignFile {
  const counts: Record<string, number> = {};
  const index = new Map(game.instances.map((inst, k) => [inst.id, k]));
  const layout: DesignPlacement[] = game.instances.map((inst) => {
    const sys = getSystem(catalog, inst.systemId);
    counts[sys.name] = (counts[sys.name] ?? 0) + (inst.scale ?? 1);
    const p: DesignPlacement = { system: sys.name, x: inst.x, y: inst.y };
    if (inst.scale !== undefined && inst.scale !== 1) p.scale = inst.scale;
    if (inst.priority !== sys.priorityTier) p.priority = inst.priority;
    if (inst.links) {
      const links: Record<string, number> = {};
      for (const [res, id] of Object.entries(inst.links)) {
        const k = index.get(id);
        if (k !== undefined) links[res] = k;
      }
      if (Object.keys(links).length) p.links = links;
    }
    return p;
  });
  return {
    schema: 'homestead.design.v1',
    name,
    site: game.site.id,
    parcelAcres: game.settings.parcelAcres,
    counts,
    layout,
  };
}

export interface DesignGameOptions {
  siteId?: string;
  seed: number;
  weatherMode: WeatherMode;
}

/**
 * A game with the design already built (prebuilt, mature), on day 0. With a layout
 * the systems go exactly where they were; without one they are laid out automatically.
 */
export function gameFromDesign(catalog: Catalog, file: DesignFile, o: DesignGameOptions): GameState {
  const site = getSite(o.siteId ?? file.site ?? 'front-range');
  let s = initGame(
    catalog,
    site,
    { parcelAcres: file.parcelAcres ?? DESIGN_DEFAULT_ACRES, weatherMode: o.weatherMode },
    o.seed,
  );
  if (!file.layout) {
    const idx = indexCatalog(catalog);
    const counts: Record<string, number> = {};
    for (const [k, n] of Object.entries(file.counts)) {
      const sys = idx.systemById.get(k) ?? idx.systemByName.get(k);
      if (!sys) throw new Error(`Design names an unknown system: ${k}`);
      counts[sys.id] = (counts[sys.id] ?? 0) + n;
    }
    return placeDesign(catalog, s, counts);
  }
  const idx = indexCatalog(catalog);
  const ids: string[] = [];
  for (const p of file.layout) {
    const sys = idx.systemById.get(p.system) ?? idx.systemByName.get(p.system);
    if (!sys) throw new Error(`Design layout names an unknown system: ${p.system}`);
    const r = placeSystem(catalog, s, sys.id, p.x, p.y, 'prebuilt', p.scale !== undefined ? { scale: p.scale } : {});
    s = r.state;
    ids.push(r.instanceId);
    if (p.priority !== undefined) s = setPriority(s, r.instanceId, p.priority);
  }
  file.layout.forEach((p, k) => {
    for (const [res, j] of Object.entries(p.links ?? {})) {
      const provider = ids[j];
      if (provider) s = setLink(s, ids[k]!, res, provider);
    }
  });
  return s;
}
