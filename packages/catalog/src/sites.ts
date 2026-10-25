import frontRange from '../../../data/sites/front-range.json';
import laramie from '../../../data/sites/laramie-wy.json';
import asheville from '../../../data/sites/asheville-nc.json';
import tucson from '../../../data/sites/tucson-az.json';
import olympia from '../../../data/sites/olympia-wa.json';
import marquette from '../../../data/sites/marquette-mi.json';
import { SiteSchema, type Site } from './schema.ts';

/** Climate presets shipped with the game, keyed by ID. */
export const SITES: Record<string, Site> = Object.fromEntries(
  // Parsed, so every site is validated and node defaults are filled in (G14).
  [frontRange, laramie, asheville, tucson, olympia, marquette].map((s) => [s.id, SiteSchema.parse(s)]),
);

export const DEFAULT_SITE_ID = 'front-range';

export function getSite(id: string): Site {
  const s = SITES[id];
  if (!s) throw new Error(`Unknown site "${id}" (known: ${Object.keys(SITES).join(', ')})`);
  return s;
}
