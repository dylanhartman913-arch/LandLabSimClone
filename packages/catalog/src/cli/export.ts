import { relative } from 'node:path';
import { CatalogExportError, exportFromFiles, REPO_ROOT, writeGenerated } from '../exporter/index.ts';

try {
  const result = exportFromFiles();
  const files = writeGenerated(result);
  const { catalog } = result;
  console.log(
    `Exported ${catalog.systems.length} systems, ${catalog.flows.length} flows, ${catalog.resources.length} resources, ${catalog.categories.length} categories.`,
  );
  for (const f of files) console.log(`  wrote ${relative(REPO_ROOT, f)}`);
} catch (err) {
  if (err instanceof CatalogExportError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}
