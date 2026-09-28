import frontRange from '../../../data/sites/front-range.json';
import laramie from '../../../data/sites/laramie-wy.json';
import asheville from '../../../data/sites/asheville-nc.json';
import type { Site } from './schema.ts';

/** Climate presets shipped with the game, keyed by ID. */
export const SITES: Record<string, Site> = Object.fromEntries(
  [frontRange, laramie, asheville].map((s) => [s.id, s as unknown as Site]),
);

export const DEFAULT_SITE_ID = 'front-range';

export function getSite(id: string): Site {
  const s = SITES[id];
  if (!s) throw new Error(`Unknown site "${id}" (known: ${Object.keys(SITES).join(', ')})`);
  return s;
}
