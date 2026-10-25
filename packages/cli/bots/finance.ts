import { writeFileSync } from 'node:fs';
import { catalog, getSite } from '@homestead/catalog';
import {
  applyAction,
  financeView,
  initGame,
  manageFinance,
  placeDesign,
  stepDays,
  type Action,
} from '@homestead/engine';
import { COMPARISONS, COMPARE_SITES, measure } from './compare.ts';
import { NEW_GAME_SETTINGS, playBot } from './run.ts';

/** Matched LL-10-style route; ordinary supplies, unchanged catalog and bot decisions. */
const out = [
  '# LL-37 finance comparisons',
  '',
  'Reproduce with `node --import tsx packages/cli/bots/finance.ts`. Experimental game balance; defaults unchanged. Two adults on the greenfield remote-job route for 365 days. Standard seed 1 and Real seeds 1–3 at each site. Variants: legacy; finance with no debt or insurance; finance with a $2,000 opening draw and insurance. The last variant deliberately keeps the loan outstanding to show its cost. Cash less debt is shown separately so borrowed cash cannot look like income.',
  '',
  '| Site | Weather/seed | Variant | Survival short days | Min wellbeing | End cash | Debt | Cash less debt and tax due | Tax paid | Interest paid | Premiums | Claims | Reserve target |',
  '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
];
for (const site of COMPARE_SITES)
  for (const difficulty of ['standard', 'real'] as const)
    for (const seed of difficulty === 'standard' ? [1] : [1, 2, 3]) {
      for (const variant of ['legacy', 'finance', 'credit+insured'] as const) {
        const policy = COMPARISONS.find((c) => c.id === 'job')!
          .variants.find((v) => v.id === 'remote')!
          .bot(null);
        let first = true;
        const bot = {
          ...policy,
          act: (cat: typeof catalog, state: Parameters<typeof policy.act>[1], log: Action[]) => {
            if (first && variant === 'credit+insured') {
              for (const body of [
                { operation: 'borrow', amount: 2000 },
                { operation: 'insurance', amount: 1 },
              ] as const) {
                const a: Action = { at: state.calendar.absDay, kind: 'finance', ...body };
                state = applyAction(cat, state, a);
                log.push(a);
              }
            }
            first = false;
            return policy.act(cat, state, log);
          },
        };
        const r = playBot(bot, {
          start: 'greenfield',
          site,
          difficulty,
          seed,
          days: 365,
          settings: { ...NEW_GAME_SETTINGS, finance: variant !== 'legacy', wearAndRepair: true },
        });
        const m = measure(r, catalog);
        const sum = (key: 'taxPaid' | 'interest' | 'capitalized' | 'premium' | 'claim') =>
          r.ledgers.reduce((a, l) => a + (l.finance?.[key] ?? 0), 0);
        const f = r.state.finance;
        out.push(
          `| ${site} | ${difficulty}/${seed} | ${variant} | ${m.essentialShortDays} | ${m.minWellbeing?.toFixed(1)} | ${r.state.cash.toFixed(0)} | ${(f?.debt ?? 0).toFixed(0)} | ${(r.state.cash - (f?.debt ?? 0) - (f?.taxDue ?? 0)).toFixed(0)} | ${sum('taxPaid').toFixed(0)} | ${(sum('interest') - sum('capitalized')).toFixed(0)} | ${sum('premium').toFixed(0)} | ${sum('claim').toFixed(0)} | ${(financeView(r.state, catalog)?.target.value ?? 0).toFixed(0)} |`,
        );
      }
    }
out.push(
  '',
  '## Controlled equipment failure',
  '',
  'Front Range, one prebuilt Bell Tent at almost zero condition, wear enabled, $10,000 starting cash before purchase, one day. All variants have finance enabled. One subsequent day checks that an existing failure cannot pay twice.',
  '',
  '| Policy | Premium | Claim | Debt | Tax due | Cash | Next-day claim |',
  '|---|---:|---:|---:|---:|---:|---:|',
);
for (const variant of ['uninsured', 'insured', 'insured, no cash'] as const) {
  const id = catalog.systems.find((s) => s.name === 'Bell Tent')!.id;
  let s = placeDesign(
    catalog,
    initGame(
      catalog,
      getSite('front-range'),
      { finance: true, wearAndRepair: true, startingCash: 10000 },
      37,
    ),
    { [id]: 1 },
    'prebuilt',
  );
  s = { ...s, instances: s.instances.map((i) => ({ ...i, condition: 1e-10 })) };
  if (variant !== 'uninsured') s = manageFinance(catalog, s, 'insurance', 1);
  if (variant === 'insured, no cash') s = { ...s, cash: 0 };
  const r = stepDays(s, catalog, 1);
  const l = r.ledgers[0]!.finance!;
  const next = stepDays(r.state, catalog, 1).ledgers[0]!.finance!;
  out.push(
    `| ${variant} | ${l.premium.toFixed(2)} | ${l.claim.toFixed(2)} | ${l.debt.toFixed(2)} | ${l.taxDue.toFixed(2)} | ${r.state.cash.toFixed(2)} | ${next.claim.toFixed(2)} |`,
  );
}
writeFileSync('docs/LL_37_COMPARISONS.md', out.join('\n') + '\n');
