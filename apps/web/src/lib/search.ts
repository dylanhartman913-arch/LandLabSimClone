import type { Catalog, System } from '@homestead/catalog';

export interface SearchEntry {
  system: System;
  name: string;
  categories: string;
  makes: string;
  uses: string;
}

export function buildSearchIndex(catalog: Catalog): SearchEntry[] {
  const makes = new Map<string, Set<string>>();
  const uses = new Map<string, Set<string>>();
  for (const f of catalog.flows) {
    const m = f.direction === 'out' ? makes : uses;
    const set = m.get(f.systemId) ?? new Set<string>();
    set.add(f.resource.toLowerCase());
    m.set(f.systemId, set);
  }
  return catalog.systems.map((s) => ({
    system: s,
    name: s.name.toLowerCase(),
    categories: s.categories.join(' ').toLowerCase(),
    makes: [...(makes.get(s.id) ?? [])].join(' | '),
    uses: [...(uses.get(s.id) ?? [])].join(' | '),
  }));
}

/** True if every character of `q` appears in `s` in order. */
function subsequence(q: string, s: string): boolean {
  let i = 0;
  for (let j = 0; j < s.length && i < q.length; j++) if (s[j] === q[i]) i++;
  return i === q.length;
}

/** Singular/plural tolerant stem ("eggs" → "egg", "berries" → "berr"). */
function stem(w: string): string {
  return w.replace(/(ies|es|s)$/, '');
}

/**
 * Score one entry against a query: name matches beat category matches beat
 * "makes" beats "uses"; a loose in-order letter match on the name scores last.
 * Returns 0 for no match.
 */
export function scoreEntry(e: SearchEntry, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const words = q.split(/\s+/).map(stem).filter(Boolean);
  let score = 0;
  for (const w of words) {
    let best = 0;
    if (e.name.startsWith(w)) best = 100;
    else if (e.name.includes(w)) best = 80;
    else if (e.categories.includes(w)) best = 60;
    else if (e.makes.includes(w)) best = 50;
    else if (e.uses.includes(w)) best = 30;
    else if (w.length >= 3 && subsequence(w, e.name)) best = 10;
    if (best === 0) return 0;
    score += best;
  }
  return score;
}

export function searchSystems(index: SearchEntry[], query: string): System[] {
  const scored = index
    .map((e) => ({ e, s: scoreEntry(e, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.e.system.name.localeCompare(b.e.system.name));
  return scored.map((x) => x.e.system);
}
