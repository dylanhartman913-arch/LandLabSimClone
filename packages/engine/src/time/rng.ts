/**
 * Seeded PRNG (mulberry32). The state is a single uint32 kept in GameState so
 * saves reproduce exactly. Returns [value in [0, 1), next state].
 */
export function nextRandom(state: number): [number, number] {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, s];
}

/** Mix an arbitrary integer seed into a well-spread initial state. */
export function seedState(seed: number): number {
  let h = (Math.trunc(seed) ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Draw n values, returning them with the advanced state. */
export function drawMany(state: number, n: number): [number[], number] {
  const out: number[] = [];
  let s = state;
  for (let i = 0; i < n; i++) {
    const [v, next] = nextRandom(s);
    out.push(v);
    s = next;
  }
  return [out, s];
}
