import type { Catalog } from '@homestead/catalog';

/** Where a resource can come from, by kind (G12 audit; G13 resource pages). */
export interface ResourceSources {
  resource: string;
  /** Catalog systems that make it, not counting conventional (bought) services. */
  producers: string[];
  /** Conventional systems that sell or supply it (grocery, grid, utilities). */
  conventional: string[];
  /** Natural nodes on the land (G14). */
  nodes: string[];
  /** Market price per unit, if the market sells it. */
  market: number | null;
}

/** Every way to get a resource, from the catalog (and, from G14, the site's natural nodes). */
export function resourceSources(catalog: Catalog, resource: string, nodeTypes: readonly { type: string; resource: string }[] = []): ResourceSources {
  const r = catalog.resources.find((x) => x.name === resource);
  const sysById = new Map(catalog.systems.map((s) => [s.id, s]));
  const producers = new Set<string>();
  const conventional = new Set<string>();
  for (const f of catalog.flows) {
    if (f.direction !== 'out' || f.resource !== resource) continue;
    const sys = sysById.get(f.systemId)!;
    (sys.categories.includes('Conventional') || sys.backstop ? conventional : producers).add(sys.id);
  }
  return {
    resource,
    producers: [...producers],
    conventional: [...conventional],
    nodes: nodeTypes.filter((n) => n.resource === resource).map((n) => n.type),
    market: r?.marketAvailable && r.marketPrice !== null ? r.marketPrice : null,
  };
}

/** Flow resources some system needs as an input (the ones that must have a findable source). */
export function inputResources(catalog: Catalog): string[] {
  const flowRes = new Set(catalog.resources.filter((r) => r.class === 'Flow').map((r) => r.name));
  return [...new Set(catalog.flows.filter((f) => f.direction === 'in' && flowRes.has(f.resource)).map((f) => f.resource))].sort();
}
