import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { catalog } from '@homestead/catalog';
import { expect } from 'vitest';
import { resolveDesign, type Design, type DesignFile } from '../src/index.ts';

export const REPO = fileURLToPath(new URL('../../../', import.meta.url));

export function loadDesign(file: string): { file: DesignFile; design: Design } {
  const df = JSON.parse(readFileSync(`${REPO}designs/${file}`, 'utf8')) as DesignFile;
  return { file: df, design: resolveDesign(catalog, df.counts) };
}

const DIGESTS = `${REPO}packages/engine/test/digests.json`;

/**
 * Compare a digest with the committed one. Run with UPDATE_DIGESTS=1 to
 * record new values after an intended change (and say why in the build log).
 */
export function expectDigest(key: string, actual: string) {
  const all: Record<string, string> = existsSync(DIGESTS) ? JSON.parse(readFileSync(DIGESTS, 'utf8')) : {};
  if (process.env.UPDATE_DIGESTS || all[key] === undefined) {
    if (!process.env.UPDATE_DIGESTS && process.env.CI) throw new Error(`Missing committed digest ${key}`);
    all[key] = actual;
    const sorted = Object.fromEntries(Object.entries(all).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(DIGESTS, `${JSON.stringify(sorted, null, 2)}\n`);
    return;
  }
  expect(actual, `digest ${key}`).toBe(all[key]);
}
