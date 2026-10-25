import { writeFileSync } from 'node:fs';
import { catalog } from '@homestead/catalog';
import { accessView } from '@homestead/engine';
import { COMPARISONS, COMPARE_SITES, measure } from './compare.ts';
import { adaptUpgraderBot } from './adaptUpgrader.ts';
import { NEW_GAME_SETTINGS, playBot } from './run.ts';

const out = [
  '# LL-39 transportation-access comparisons',
  '',
  'Reproduce with `node --import tsx packages/cli/bots/access.ts`. Experimental game balance, no default changes. Matched first-year (365-day) policies at three sites; Standard seed 1 and Real seeds 1–3. Greenfield remote work, greenfield part-time on-site work, and adapt-upgrader. Settings otherwise match current defaults: risk, Finance, wear and livestock experiments remain off on both sides. Only `transportAccess` differs; the existing bots keep their decisions. Coverage omits access trips only in the enabled variant, so score changes must not be read as new physical supplies.',
  '',
  '| Route | Site | Weather/seed | Access gate | Survival-short days | Min wellbeing | End cash | Completed trips | Blocked trips | Own miles used | Paid fares (year) | Fares payable |',
  '|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
];
for (const route of ['remote', 'part', 'adapt'] as const)
  for (const site of COMPARE_SITES)
    for (const difficulty of ['standard', 'real'] as const)
      for (const seed of difficulty === 'standard' ? [1] : [1, 2, 3])
        for (const enabled of [false, true]) {
          const bot =
            route === 'adapt'
              ? adaptUpgraderBot()
              : COMPARISONS.find((c) => c.id === 'job')!
                  .variants.find((v) => v.id === route)!
                  .bot(null);
          const r = playBot(bot, {
            start: route === 'adapt' ? 'adapt' : 'greenfield',
            site,
            difficulty,
            seed,
            days: 365,
            settings: { ...NEW_GAME_SETTINGS, transportAccess: enabled },
          });
          const m = measure(r, catalog);
          const trips = r.ledgers.flatMap((l) => l.access?.trips ?? []);
          const paid =
            trips.reduce((a, t) => a + t.fare, 0) +
            r.ledgers.reduce((a, l) => a + (l.access?.repaid ?? 0), 0);
          out.push(
            `| ${route} | ${site} | ${difficulty}/${seed} | ${enabled ? 'on' : 'off'} | ${m.essentialShortDays} | ${m.minWellbeing.toFixed(1)} | ${r.state.cash.toFixed(0)} | ${trips.filter((t) => t.completed).length} | ${trips.filter((t) => !t.completed).length} | ${trips.reduce((a, t) => a + t.ownMiles, 0).toFixed(1)} | ${paid.toFixed(0)} | ${(accessView(r.state)?.fareDue.value ?? 0).toFixed(0)} |`,
          );
        }
out.push(
  '',
  'The enabled trip counts include batched errands, commute equivalents at allocated work hours, and any necessary town journeys. A completed paid ride supplies access without inventing owned Transportation production. The disabled variant retains its legacy transport requirements and fees; zero recorded access trips there means the new trip ledger was disabled, not that old market deliveries were free.',
);
writeFileSync('docs/LL_39_COMPARISONS.md', out.join('\n') + '\n');
