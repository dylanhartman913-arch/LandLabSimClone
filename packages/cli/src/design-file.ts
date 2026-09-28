import { readFileSync } from 'node:fs';
import { catalog } from '@homestead/catalog';
import { resolveDesign, type Design, type DesignFile } from '@homestead/engine';

export function loadDesignFile(path: string): { file: DesignFile; design: Design } {
  const file = JSON.parse(readFileSync(path, 'utf8')) as DesignFile;
  if (file.schema !== 'homestead.design.v1') throw new Error(`${path}: expected schema homestead.design.v1`);
  return { file, design: resolveDesign(catalog, file.counts) };
}
