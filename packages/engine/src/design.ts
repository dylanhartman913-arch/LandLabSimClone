import type { Catalog } from '@homestead/catalog';
import { indexCatalog } from './catalog-index.ts';

/** A balance-mode design: how many of each system, keyed by system ID. */
export interface Design {
  counts: Record<string, number>;
}

/** On-disk design file (`designs/*.json`). Keys may be system IDs or exact system names. */
export interface DesignFile {
  schema: 'homestead.design.v1';
  name: string;
  description?: string;
  site?: string;
  counts: Record<string, number>;
}

/** Resolve a design whose counts may be keyed by system name into one keyed by ID. */
export function resolveDesign(catalog: Catalog, counts: Record<string, number>): Design {
  const idx = indexCatalog(catalog);
  const out: Record<string, number> = {};
  const unknown: string[] = [];
  for (const [key, n] of Object.entries(counts)) {
    const sys = idx.systemById.get(key) ?? idx.systemByName.get(key);
    if (!sys) {
      unknown.push(key);
      continue;
    }
    if (!Number.isFinite(n) || n < 0)
      throw new Error(`Design count for ${key} must be a non-negative number`);
    out[sys.id] = (out[sys.id] ?? 0) + n;
  }
  if (unknown.length) throw new Error(`Design names unknown systems: ${unknown.join(', ')}`);
  return { counts: out };
}
