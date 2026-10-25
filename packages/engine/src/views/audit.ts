import type { Catalog, NeedKey, Site } from '@homestead/catalog';
import { resourceSources } from './sources.ts';

/**
 * LL-47 catalog audit. Three structural gates over the workbook catalog and the three sites:
 *
 * 1. Dead ends: a Flow resource that some system makes but nothing uses — no system input, no
 *    checklist need it feeds or substitutes for, no engine rule that consumes it, and no market price.
 * 2. Fragile survival inputs: a Flow input of a system that makes a survival-need resource, with
 *    fewer than two non-market sources (home producers plus kinds of natural node).
 * 3. Unsuppliable systems: a system with an input that has no source at any of the three sites.
 */

/** Checklist rows whose shortfall hurts survival wellbeing (LL-14 survival needs). */
export const SURVIVAL_ROWS: readonly NeedKey[] = ['Water', 'Drinking water', 'Food', 'Shelter', 'Sanitation', 'Heated shelter'];

/** Inputs every system draws that are not physical supplies. */
const NOT_SUPPLIES = new Set(['Labor', 'Capital']);

export interface ResourceAudit {
  resource: string;
  producers: string[];
  /** Home producers: not conventional, not a backstop. */
  homeProducers: string[];
  nodes: string[];
  consumers: string[];
  /** Other ways it is used: a checklist need, a substitute, an engine rule or a sale. */
  outlets: string[];
  market: 'buy' | 'sell only' | null;
}

export interface SiteSupply {
  site: string;
  /** Inputs with no producer, node, ambient or market here. */
  missing: string[];
}

export interface CatalogAudit {
  resources: ResourceAudit[];
  deadEnds: string[];
  survivalInputs: { resource: string; nonMarketSources: number; detail: string }[];
  fragile: string[];
  systems: { id: string; name: string; sites: SiteSupply[] }[];
  unsuppliable: string[];
}

function engineConsumers(catalog: Catalog): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of catalog.preservationRecipes ?? []) for (const i of r.inputs) out.set(i, 'preservation recipe');
  if (catalog.soilFertility?.manureCompostEquivalent) out.set('Manure', 'soil fertility (manure on gardens)');
  if (catalog.livestockInfrastructure) out.set('Eggs', 'hatching');
  return out;
}

/** Producers the engine adds outside workbook flows. */
function engineProducers(catalog: Catalog, resource: string): string[] {
  if (resource === 'Preserved food') return (catalog.preservationRecipes ?? []).map((r) => r.systemId);
  return [];
}

export function catalogAudit(catalog: Catalog, sites: readonly Site[]): CatalogAudit {
  const sysById = new Map(catalog.systems.map((s) => [s.id, s]));
  const flowRes = catalog.resources.filter((r) => r.class === 'Flow');
  const ambient = new Set(catalog.resources.filter((r) => r.class === 'Ambient').map((r) => r.name));
  const allNodes = sites.flatMap((s) => (s as { nodes?: { type: string; resource: string }[] }).nodes ?? []);
  const viaEngine = engineConsumers(catalog);
  const substitutes = new Map<string, string>();
  for (const r of catalog.resources) for (const sub of r.satisfiedBy ?? []) substitutes.set(sub, r.name);

  const resources: ResourceAudit[] = flowRes.map((r) => {
    const src = resourceSources(catalog, r.name, allNodes);
    const homeProducers = [...new Set([...src.producers, ...engineProducers(catalog, r.name)])];
    const consumers = [...new Set(catalog.flows.filter((f) => f.direction === 'in' && f.resource === r.name).map((f) => f.systemId))];
    const outlets: string[] = [];
    if (r.needsRow) outlets.push(`checklist: ${r.needsRow}`);
    if (substitutes.has(r.name)) outlets.push(`substitutes for ${substitutes.get(r.name)}`);
    if (viaEngine.has(r.name)) outlets.push(viaEngine.get(r.name)!);
    const market = r.marketPrice !== null && r.marketPrice > 0 ? (r.marketAvailable ? 'buy' : 'sell only') : null;
    if (market) outlets.push(market === 'buy' ? 'market' : 'market sale');
    return {
      resource: r.name,
      producers: [...src.producers, ...src.conventional],
      homeProducers,
      nodes: [...new Set(src.nodes)],
      consumers,
      outlets,
      market,
    };
  });
  const byName = new Map(resources.map((r) => [r.resource, r]));

  const deadEnds = resources
    .filter((r) => r.producers.length + r.homeProducers.length > 0 && r.consumers.length === 0 && r.outlets.length === 0)
    .map((r) => r.resource);

  // Systems that make a survival-need resource, and the Flow supplies they draw.
  const survivalMakers = new Set(
    catalog.flows
      .filter((f) => f.direction === 'out')
      .filter((f) => {
        const r = catalog.resources.find((x) => x.name === f.resource);
        return !!r?.needsRow && SURVIVAL_ROWS.includes(r.needsRow);
      })
      .map((f) => f.systemId)
      .filter((id) => {
        const s = sysById.get(id)!;
        return !s.categories.includes('Conventional') && !s.backstop && !s.categories.includes('Household');
      }),
  );
  const survivalSet = new Set<string>();
  for (const f of catalog.flows)
    if (f.direction === 'in' && survivalMakers.has(f.systemId) && !NOT_SUPPLIES.has(f.resource) && byName.has(f.resource))
      survivalSet.add(f.resource);
  const survivalInputs = [...survivalSet].sort().map((name) => {
    const r = byName.get(name)!;
    const kinds = r.homeProducers.length + r.nodes.length;
    return {
      resource: name,
      nonMarketSources: kinds,
      detail: `${r.homeProducers.length} home producer(s)${r.nodes.length ? `, node(s): ${r.nodes.join(', ')}` : ''}${r.market === 'buy' ? '; market' : ''}`,
    };
  });
  const fragile = survivalInputs.filter((s) => s.nonMarketSources < 2).map((s) => s.resource);

  // Per-site supply of every system input (one level: a source exists, not that it is itself supplied).
  const supplied = (site: Site, resource: string): boolean => {
    if (ambient.has(resource)) return !!(site as { ambient?: Record<string, boolean> }).ambient?.[resource];
    const r = catalog.resources.find((x) => x.name === resource);
    if (!r) return false;
    if (r.class === 'Money' || resource === 'Labor') return true;
    const nodes = ((site as { nodes?: { resource: string }[] }).nodes ?? []).some((n) => n.resource === resource);
    if (nodes) return true;
    if (r.marketAvailable && r.marketPrice !== null) return true;
    return catalog.flows.some((f) => {
      if (f.direction !== 'out' || f.resource !== resource) return false;
      // A producer that itself needs a missing ambient (a stream) cannot supply here.
      return catalog.flows
        .filter((g) => g.systemId === f.systemId && g.direction === 'in' && ambient.has(g.resource))
        .every((g) => !!(site as { ambient?: Record<string, boolean> }).ambient?.[g.resource]);
    });
  };
  const systems = catalog.systems
    .filter((s) => !s.categories.includes('Household'))
    .map((s) => ({
      id: s.id,
      name: s.name,
      sites: sites.map((site) => ({
        site: site.id,
        missing: [...new Set(catalog.flows.filter((f) => f.systemId === s.id && f.direction === 'in').map((f) => f.resource))].filter(
          (res) => !supplied(site, res),
        ),
      })),
    }));
  const unsuppliable = systems.filter((s) => s.sites.every((x) => x.missing.length > 0)).map((s) => s.name);
  return { resources, deadEnds, survivalInputs, fragile, systems, unsuppliable };
}

export interface AuditGates {
  /** Findings not covered by a reviewed exception: each fails the gate. */
  failures: { gate: 'dead end' | 'fragile survival input' | 'unsuppliable system'; name: string }[];
  /** Exceptions whose finding is gone: remove them so the list only shrinks. */
  stale: string[];
}

export function auditGates(catalog: Catalog, audit: CatalogAudit): AuditGates {
  const ex = catalog.auditExceptions ?? { deadEnds: [], fragileSurvivalInputs: [], unsuppliableSystems: [] };
  const failures: AuditGates['failures'] = [];
  const stale: string[] = [];
  const check = (gate: AuditGates['failures'][number]['gate'], found: string[], allowed: { name: string }[]) => {
    const ok = new Set(allowed.map((e) => e.name));
    for (const name of found) if (!ok.has(name)) failures.push({ gate, name });
    for (const name of ok) if (!found.includes(name)) stale.push(`${gate}: ${name}`);
  };
  check('dead end', audit.deadEnds, ex.deadEnds);
  check('fragile survival input', audit.fragile, ex.fragileSurvivalInputs);
  check('unsuppliable system', audit.unsuppliable, ex.unsuppliableSystems);
  return { failures, stale };
}

/** The published audit section of docs/CATALOG.md (regenerated by `npm run catalog:audit`). */
export function auditMarkdown(catalog: Catalog, audit: CatalogAudit, siteIds: readonly string[]): string {
  const ex = catalog.auditExceptions;
  const gates = auditGates(catalog, audit);
  const reason = (list: { name: string; reason: string; followUp?: string }[] | undefined, name: string) => {
    const e = list?.find((x) => x.name === name);
    return e ? `${e.reason}${e.followUp ? ` Follow-up: ${e.followUp}` : ''}` : '';
  };
  const lines = [
    '## Catalog audit (LL-47)',
    '',
    `Generated by \`npm run catalog:audit\` from the exported catalog and the ${siteIds.length} sites (${siteIds.join(', ')}); \`packages/engine/test/catalog-audit.test.ts\` fails if this section is out of date. Do not edit it by hand.`,
    '',
    'Three gates, enforced by that test:',
    '',
    '1. **No dead ends.** Every Flow resource some system makes must have a use: a system input, a checklist need it feeds or substitutes for, an engine rule that consumes it, or a market price.',
    '2. **Two non-market sources for survival inputs.** Every Flow input of a home system that makes a survival-need resource (water, drinking water, food, shelter, sanitation, heat) needs at least two home producers or kinds of natural node.',
    '3. **No unsuppliable systems.** Every system must have at least one site where each input has a source: a producer that can run there, a natural node, the site\'s ambient (sun, rain, wind, a stream) or the market.',
    '',
    'A finding can pass only through a reviewed exception in `data/catalog_overrides.json` (`auditExceptions`) with its reason. The test also fails when an exception is no longer needed, so the list only shrinks.',
    '',
    `**Result:** ${gates.failures.length ? `${gates.failures.length} failure(s)` : 'all gates pass'}; ${audit.deadEnds.length} dead end(s), ${audit.fragile.length} fragile survival input(s) (all excepted below), ${audit.unsuppliable.length} unsuppliable system(s).`,
    '',
    '### Survival inputs',
    '',
    '| Resource | Non-market sources | Sources | Status |',
    '|---|---:|---|---|',
    ...audit.survivalInputs.map(
      (s) => `| ${s.resource} | ${s.nonMarketSources} | ${s.detail} | ${s.nonMarketSources >= 2 ? 'pass' : `exception: ${reason(ex?.fragileSurvivalInputs, s.resource) || 'NONE (fails)'}`} |`,
    ),
    '',
    '### Resource uses',
    '',
    'Every Flow resource with a producer, and what uses it.',
    '',
    '| Resource | Producers | Home producers | Nodes | System consumers | Other uses |',
    '|---|---:|---:|---|---:|---|',
    ...audit.resources
      .filter((r) => r.producers.length + r.homeProducers.length > 0)
      .map((r) => `| ${r.resource} | ${r.producers.length} | ${r.homeProducers.length} | ${r.nodes.join(', ') || '—'} | ${r.consumers.length} | ${r.outlets.join('; ') || '—'} |`),
    '',
    '### Systems by site',
    '',
    `Systems that cannot run at every site, and the input missing there. ${audit.systems.filter((s) => s.sites.every((x) => !x.missing.length)).length} of ${audit.systems.length} systems can be supplied at all ${siteIds.length} sites.`,
    '',
    '| System | ' + siteIds.join(' | ') + ' |',
    '|---|' + siteIds.map(() => '---').join('|') + '|',
    ...audit.systems
      .filter((s) => s.sites.some((x) => x.missing.length))
      .map((s) => `| ${s.name} | ${s.sites.map((x) => (x.missing.length ? `missing ${x.missing.join(', ')}` : 'ok')).join(' | ')} |`),
    '',
  ];
  return lines.join('\n');
}
