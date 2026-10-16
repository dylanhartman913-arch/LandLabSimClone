import type { Bot } from './types.ts';

/** Does nothing: the start must carry itself (the "first hardship" and "nobody leaves" gates). */
export function idleBot(): Bot {
  return { name: 'idle', act: (_c, s) => s };
}
