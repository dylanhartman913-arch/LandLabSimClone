export interface ParsedArgs {
  command: string | undefined;
  positional: string[];
  flags: Record<string, string | true>;
}

/** Minimal `cmd pos1 --flag value --switch` parser (no dependencies). */
export function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split('=', 2) as [string, string | undefined];
      const next = rest[i + 1];
      if (inline !== undefined) flags[k] = inline;
      else if (next !== undefined && !next.startsWith('--')) {
        flags[k] = next;
        i++;
      } else flags[k] = true;
    } else positional.push(a);
  }
  return { command, positional, flags };
}

export function numFlag(flags: ParsedArgs['flags'], key: string, fallback: number): number {
  const v = flags[key];
  if (v === undefined || v === true) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${key} must be a number, got "${v}"`);
  return n;
}
