import { ENGINE_VERSION } from '@homestead/engine';
import { parseArgs } from './args.ts';
import { runBalance } from './commands/balance.ts';
import { loadDesignFile } from './design-file.ts';

const USAGE = `TERRA Homestead Plugin simulator ${ENGINE_VERSION}

Usage:
  npm run sim -- balance <design.json>
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
      console.log(runBalance(design, file.name));
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
