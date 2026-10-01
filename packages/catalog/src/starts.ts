import adapt from '../../../data/starts/adapt.json';
import greenfield from '../../../data/starts/greenfield.json';
import { StartSchema, type Start } from './schema.ts';

/** The two ways to start (G15), validated. */
export const STARTS: Record<string, Start> = Object.fromEntries(
  [adapt, greenfield].map((s) => [s.id, StartSchema.parse(s)]),
);

export function getStart(id: string): Start {
  const s = STARTS[id];
  if (!s) throw new Error(`Unknown start "${id}" (known: ${Object.keys(STARTS).join(', ')})`);
  return s;
}
