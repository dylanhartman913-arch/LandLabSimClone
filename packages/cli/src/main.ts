import { ENGINE_VERSION } from '@homestead/engine';
import { DEFAULT_SITE_ID, getSite } from '@homestead/catalog';
import { numFlag, parseArgs } from './args.ts';
import { runBalance } from './commands/balance.ts';
import { compareCi, PROFILES, runCompare } from './commands/compare.ts';
import { runCoverageCommand } from './commands/coverage.ts';
import { householdReport } from '../bots/households.ts';
import { writeFileSync } from 'node:fs';
import { runMonteCarlo } from './commands/montecarlo.ts';
import { runPacing } from './commands/pacing.ts';
import { runTime } from './commands/run.ts';
import { loadDesignFile } from './design-file.ts';

const USAGE = `TERRA Homestead Plugin simulator ${ENGINE_VERSION}

Usage:
  npm run sim -- balance <design.json> [--site <id>]
  npm run sim -- run <design.json> [--site <id>] [--years N] [--seed N] [--weather average|real]
                 [--flow-record records.json] [--csv ledgers.csv]
  npm run sim -- montecarlo <design.json> [--site <id>] [--years N] [--seeds N] [--seed N]
                 [--weather real|average] [--json out.json]
  npm run sim -- pacing      (the playtest bots' pacing gates; exits 1 if any misses)
  npm run sim -- coverage [--md report.md]
                 (LL-49 alert coverage: exits 1 if a cliff is under-warned or never reached)
  npm run sim -- compare [--md report.md] [--json runs.json] [--days N] [--profile new-game|experimental]
                 (LL-10 controlled first-year strategy comparisons)
  npm run sim -- households [--md report.md]
                 (start kits scale with the household: exits 1 if a household starts worse off)
  npm run sim -- compare --ci [--update]
                 (LL-50: both profiles against the committed reports, headlines and notes)

Monte Carlo runs seeds N, N+1, … (default 1) in real weather; the app's Monte Carlo
panel shows the same numbers for the same design file, site, years, and seeds.
`;

function main(argv: string[]): number {
  const args = parseArgs(argv);
  const designPath = args.positional[0];
  switch (args.command) {
    case 'pacing': {
      const r = runPacing();
      console.log(r.text);
      return r.pass ? 0 : 1;
    }
    case 'coverage': {
      const r = runCoverageCommand({ md: typeof args.flags.md === 'string' ? args.flags.md : undefined });
      console.log(r.text);
      return r.pass ? 0 : 1;
    }
    case 'households': {
      const r = householdReport();
      if (typeof args.flags.md === 'string') writeFileSync(args.flags.md, r.text + '\n');
      console.log(r.text);
      return r.pass ? 0 : 1;
    }
    case 'compare': {
      if (args.flags.ci) {
        const r = compareCi({ update: args.flags.update === true });
        console.log(r.text);
        return r.pass ? 0 : 1;
      }
      const profile = typeof args.flags.profile === 'string' ? PROFILES.find((p) => p.id === args.flags.profile) : undefined;
      if (args.flags.profile !== undefined && !profile) throw new Error(`--profile must be one of ${PROFILES.map((p) => p.id).join(', ')}`);
      console.log(
        runCompare({
          md: typeof args.flags.md === 'string' ? args.flags.md : undefined,
          json: typeof args.flags.json === 'string' ? args.flags.json : undefined,
          days: numFlag(args.flags, 'days', 365),
          profile,
        }),
      );
      return 0;
    }
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
        runTime(file, design, {
          site,
          years: numFlag(args.flags, 'years', 1),
          seed: numFlag(args.flags, 'seed', 1),
          weatherMode: args.flags.weather === 'real' ? 'real' : 'average',
          flowRecordPath: typeof args.flags['flow-record'] === 'string' ? args.flags['flow-record'] : undefined,
          csvPath: typeof args.flags.csv === 'string' ? args.flags.csv : undefined,
        }),
      );
      return 0;
    }
    case 'montecarlo': {
      if (!designPath) break;
      const { file } = loadDesignFile(designPath);
      const site = typeof args.flags.site === 'string' ? args.flags.site : (file.site ?? DEFAULT_SITE_ID);
      console.log(
        runMonteCarlo(
          {
            design: file,
            siteId: site,
            years: numFlag(args.flags, 'years', 10),
            seeds: numFlag(args.flags, 'seeds', 200),
            baseSeed: numFlag(args.flags, 'seed', 1),
            weatherMode: args.flags.weather === 'average' ? 'average' : 'real',
          },
          { json: typeof args.flags.json === 'string' ? args.flags.json : undefined },
        ),
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
