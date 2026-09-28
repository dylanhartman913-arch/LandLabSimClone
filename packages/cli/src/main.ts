import { ENGINE_VERSION } from '@homestead/engine';
import { DEFAULT_SITE_ID, getSite } from '@homestead/catalog';
import { numFlag, parseArgs } from './args.ts';
import { runBalance } from './commands/balance.ts';
import { runTime } from './commands/run.ts';
import { loadDesignFile } from './design-file.ts';

const USAGE = `TERRA Homestead Plugin simulator ${ENGINE_VERSION}

Usage:
  npm run sim -- balance <design.json> [--site <id>]
  npm run sim -- run <design.json> [--site <id>] [--years N] [--seed N]
  npm run sim -- montecarlo <design.json> [--site <id>] [--years N] [--seeds N]
`;

function main(argv: string[]): number {
  const args = parseArgs(argv);
  const designPath = args.positional[0];
  switch (args.command) {
    case 'balance': {
      if (!designPath) break;
      const { file, design } = loadDesignFile(designPath);
      const site = typeof args.flags.site === 'string' ? getSite(args.flags.site) : undefined;
      console.log(runBalance(design, file.name, site?.assumptions));
      return 0;
    }
    case 'run': {
      if (!designPath) break;
      const { file, design } = loadDesignFile(designPath);
      const site = typeof args.flags.site === 'string' ? args.flags.site : (file.site ?? DEFAULT_SITE_ID);
      console.log(
        runTime(design, file.name, {
          site,
          years: numFlag(args.flags, 'years', 1),
          seed: numFlag(args.flags, 'seed', 1),
        }),
      );
      return 0;
    }
    case undefined:
    case 'help':
    case '--help':
      console.log(USAGE);
      return 0;
  }
  console.error(USAGE);
  return 1;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
