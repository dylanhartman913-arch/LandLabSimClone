import type { Catalog, Flow, Resource, System } from '@homestead/catalog';

/** Lookups built once per catalog object. */
export interface CatalogIndex {
  systemById: Map<string, System>;
  systemByName: Map<string, System>;
  resourceByName: Map<string, Resource>;
  flowsBySystem: Map<string, Flow[]>;
  flowById: Map<string, Flow>;
  /** Catalog row order of each flow (provenance keeps spreadsheet order). */
  flowOrder: Map<string, number>;
}

const cache = new WeakMap<Catalog, CatalogIndex>();

export function indexCatalog(catalog: Catalog): CatalogIndex {
  const hit = cache.get(catalog);
  if (hit) return hit;
  const flowsBySystem = new Map<string, Flow[]>();
  for (const s of catalog.systems) flowsBySystem.set(s.id, []);
  for (const f of catalog.flows) flowsBySystem.get(f.systemId)?.push(f);
  const idx: CatalogIndex = {
    systemById: new Map(catalog.systems.map((s) => [s.id, s])),
    systemByName: new Map(catalog.systems.map((s) => [s.name, s])),
    resourceByName: new Map(catalog.resources.map((r) => [r.name, r])),
    flowsBySystem,
    flowById: new Map(catalog.flows.map((f) => [f.id, f])),
    flowOrder: new Map(catalog.flows.map((f, i) => [f.id, i])),
  };
  cache.set(catalog, idx);
  return idx;
}

export function getSystem(catalog: Catalog, id: string): System {
  const s = indexCatalog(catalog).systemById.get(id);
  if (!s) throw new Error(`Unknown system ${id}`);
  return s;
}

export function getResource(catalog: Catalog, name: string): Resource {
  const r = indexCatalog(catalog).resourceByName.get(name);
  if (!r) throw new Error(`Unknown resource ${name}`);
  return r;
}
