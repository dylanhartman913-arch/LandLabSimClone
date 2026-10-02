import { describe, expect, it } from 'vitest';
import { getSite, SITES } from '@homestead/catalog';
import { inputResources, resourceSources } from '../src/index.ts';
import { catalog } from './time-helpers.ts';

/**
 * G12 handoff: every Flow resource some system needs has at least one findable source: a
 * non-conventional producer in the catalog, a natural node on a site (G14), or a market listing.
 * Resources with only one kind of source are listed as warnings.
 */
describe('every input has a source', () => {
  const nodes = Object.keys(SITES).flatMap((id) => (getSite(id) as { nodes?: { type: string; resource: string }[] }).nodes ?? []);

  it('each input resource can be made, gathered, or bought', () => {
    const missing: string[] = [];
    const single: string[] = [];
    for (const r of inputResources(catalog)) {
      const s = resourceSources(catalog, r, nodes);
      const kinds = [s.producers.length > 0, s.nodes.length > 0, s.market !== null].filter(Boolean).length;
      if (kinds === 0) missing.push(r);
      else if (kinds === 1 && s.producers.length <= 1) single.push(`${r} (${s.producers.length ? 'one producer' : s.nodes.length ? 'nodes only' : 'market only'})`);
    }
    if (single.length) console.warn(`Resources with only one source: ${single.join(', ')}`);
    expect(missing).toEqual([]);
  });
});
