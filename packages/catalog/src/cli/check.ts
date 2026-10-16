import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  CatalogExportError,
  exportFromFiles,
  GENERATED_DIR,
  REPO_ROOT,
  renderGenerated,
} from '../exporter/index.ts';

// Re-export in memory and diff against the committed generated files.
try {
  const fresh = renderGenerated(exportFromFiles());
  const stale: string[] = [];
  for (const [name, text] of Object.entries(fresh)) {
    const path = join(GENERATED_DIR, name);
    if (!existsSync(path) || readFileSync(path, 'utf8') !== text) stale.push(relative(REPO_ROOT, path));
  }
  if (stale.length) {
    console.error(
      `Generated catalog is out of sync with the xlsx or overrides:\n  ${stale.join('\n  ')}\nRun \`npm run catalog:export\` and commit the result.`,
    );
    process.exit(1);
  }
  console.log('catalog:check: generated files match data/source and data/catalog_overrides.json');
} catch (err) {
  if (err instanceof CatalogExportError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}
