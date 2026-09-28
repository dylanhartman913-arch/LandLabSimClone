import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportCatalog, type ExportResult } from './export.ts';

export const REPO_ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
export const DEFAULT_XLSX = join(REPO_ROOT, 'data/source/LandLab_Sim_Systems_v2.xlsx');
export const DEFAULT_OVERRIDES = join(REPO_ROOT, 'data/catalog_overrides.json');
export const GENERATED_DIR = join(REPO_ROOT, 'packages/catalog/generated');

export function exportFromFiles(xlsxPath = DEFAULT_XLSX, overridesPath = DEFAULT_OVERRIDES): ExportResult {
  const xlsx = new Uint8Array(readFileSync(xlsxPath));
  const overrides: unknown = JSON.parse(readFileSync(overridesPath, 'utf8'));
  return exportCatalog({ xlsx, xlsxName: basename(xlsxPath), overrides });
}

/** Deterministic JSON: 2-space indent, trailing newline. Key order follows construction order. */
export function toJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function renderGenerated(result: ExportResult): Record<string, string> {
  return {
    'catalog.json': toJson(result.catalog),
    'goldens.json': toJson(result.goldens),
  };
}

export function writeGenerated(result: ExportResult, outDir = GENERATED_DIR): string[] {
  mkdirSync(outDir, { recursive: true });
  const files = renderGenerated(result);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(outDir, name), text);
  return Object.keys(files).map((f) => join(outDir, f));
}
