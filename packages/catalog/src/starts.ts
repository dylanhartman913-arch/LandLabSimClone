import adapt from '../../../data/starts/adapt.json';
import greenfield from '../../../data/starts/greenfield.json';
import cabin from '../../../data/starts/cabin.json';
import farm from '../../../data/starts/farm.json';
import { StartSchema, type Start } from './schema.ts';

/** The ways to start (G15; LL-51 adds the cabin and the farm), validated. */
export const STARTS: Record<string, Start> = Object.fromEntries(
  [adapt, greenfield, cabin, farm].map((s) => [s.id, StartSchema.parse(s)]),
);

export function getStart(id: string): Start {
  const s = STARTS[id];
  if (!s) throw new Error(`Unknown start "${id}" (known: ${Object.keys(STARTS).join(', ')})`);
  return s;
}
