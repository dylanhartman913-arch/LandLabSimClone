import { writeFileSync } from 'node:fs';
import { catalog, getSite } from '@homestead/catalog';
import { applyAction, initGame, placeDesign, stepDays } from '@homestead/engine';

const id = (name: string) => catalog.systems.find((s) => s.name === name)!.id;
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0);
const sites = ['front-range', 'laramie-wy', 'asheville-nc'];
const meadow = 'Hay Meadow (1/10 acre)';
const mix = 'Poultry Feed Mix';
const barn = 'Hay Barn';
function camp(
  site: string,
  systems: Record<string, number>,
  stocks: Record<string, number>,
  real = false,
  seed = 1,
) {
  return placeDesign(
    catalog,
    initGame(
      catalog,
      getSite(site),
      {
        toolGathering: true,
        storagePools: true,
        startDay: 0,
        wellbeingMult: 0,
        weatherMode: real ? 'real' : 'average',
        startingCash: 100000,
        startingStocks: { Food: 1e6, 'Drinking water': 300, ...stocks },
      },
      seed,
    ),
    Object.fromEntries(
      Object.entries({
        'Human Being': 1,
        'Root Cellar': 1,
        'Potable Water Tank (100 gal)': 3,
        ...systems,
      }).map(([name, count]) => [id(name), count]),
    ),
    'prebuilt',
  );
}
const out = [
  '# LL-42 feed and fodder comparisons',
  '',
  'Reproduce with `node --import tsx packages/cli/bots/fodder.ts`. Controlled equipment checks, not survival-route claims: food/cash/water stocks supplied, wellbeing drift disabled. New systems use ordinary finite inputs and labor. No defaults change.',
  '',
  '## Full-year hay cutting',
  '',
  'One adult, one 0.1-acre meadow, one barn (both variants), January 1–December 31. Scythe labor is shown separately so its upkeep is not hidden. Fully staffed yield is the same; cutting time falls. Standard seed 1 and Real seeds 1–3, all sites.',
  '',
  '| Site | Weather/seed | Scythe | Hay produced (lb) | Meadow labor (h) | Cutting hours saved | Scythe upkeep (h) |',
  '|---|---|---|---:|---:|---:|---:|',
];
for (const site of sites)
  for (const real of [false, true])
    for (const seed of real ? [1, 2, 3] : [1])
      for (const tool of [false, true]) {
        const s = camp(site, { [meadow]: 1, [barn]: 1, ...(tool ? { Scythe: 1 } : {}) }, {}, real, seed);
        const r = stepDays(s, catalog, 365);
        out.push(
          `| ${site} | ${real ? 'Real' : 'Standard'}/${seed} | ${tool ? 'yes' : 'no'} | ${sum(r.ledgers, (l) => l.resources.Hay!.produced).toFixed(2)} | ${sum(r.ledgers, (l) => l.laborBySystem[id(meadow)] ?? 0).toFixed(2)} | ${sum(r.ledgers, (l) => sum(l.fodder ?? [], (f) => f.savedHours)).toFixed(2)} | ${sum(r.ledgers, (l) => l.laborBySystem[id('Scythe')] ?? 0).toFixed(2)} |`,
        );
      }
out.push(
  '',
  '## Finite feed batches',
  '',
  'One adult, seven days, no birds. Each variant starts with 21 lb grain, 4 lb greens and 2 lb grubs, except the named missing input. Barn and root cellar in all variants. Grain may also be eaten by the person; processing is separate from meals.',
  '',
  '| Variant | Grain processed (lb) | Greens processed (lb) | Grubs processed (lb) | Feed made (lb) | Processing loss (lb) | Mix labor (h) |',
  '|---|---:|---:|---:|---:|---:|---:|',
);
for (const missing of [null, 'Grain', 'Green biomass', 'Grubs']) {
  const stocks: Record<string, number> = { Grain: 21, 'Green biomass': 4, Grubs: 2 };
  if (missing) stocks[missing] = 0;
  const s = camp('front-range', { [mix]: 1, [barn]: 1 }, stocks);
  const r = stepDays(s, catalog, 7);
  const used = ['Grain', 'Green biomass', 'Grubs'].map((resource) =>
    sum(r.ledgers, (l) => l.resources[resource]!.processed ?? 0),
  );
  const made = sum(r.ledgers, (l) => l.resources['Chicken feed']!.produced);
  out.push(
    `| ${missing ? `no ${missing}` : 'all ingredients'} | ${used.map((v) => v.toFixed(2)).join(' | ')} | ${made.toFixed(2)} | ${(sum(used, (n) => n) - made).toFixed(2)} | ${sum(r.ledgers, (l) => l.laborBySystem[id(mix)] ?? 0).toFixed(2)} |`,
  );
}
out.push(
  '',
  '## Shared storage and delivery',
  '',
  'Orders for 1,900 lb hay and 400 lb feed, applied in that order, one day, $10,000 cash. Barn contributes 200 cu ft; bins contribute 10. Hay uses 9.5 lb/cu ft, feed 40 lb/cu ft. The two resources share capacity; barn space cannot store tools.',
  '',
  '| Storage | Hay delivered (lb) | Feed delivered (lb) | Hay left to order (lb) | Feed left to order (lb) |',
  '|---|---:|---:|---:|---:|',
);
for (const built of [false, true]) {
  let s = initGame(
    catalog,
    getSite('front-range'),
    { storagePools: true, startingCash: 10000, startingStocks: {} },
    1,
  );
  if (built) s = placeDesign(catalog, s, { [id(barn)]: 1 }, 'prebuilt');
  s = applyAction(catalog, s, { kind: 'buy', resource: 'Hay', amount: 1900, at: 0 });
  s = applyAction(catalog, s, { kind: 'buy', resource: 'Chicken feed', amount: 400, at: 0 });
  const r = stepDays(s, catalog, 1);
  const hay = r.ledgers[0]!.resources.Hay!.purchased;
  const feed = r.ledgers[0]!.resources['Chicken feed']!.purchased;
  out.push(
    `| ${built ? 'barn + bins' : 'bins only'} | ${hay.toFixed(1)} | ${feed.toFixed(1)} | ${(1900 - hay).toFixed(1)} | ${(400 - feed).toFixed(1)} |`,
  );
}
out.push(
  '',
  'Limits: seasonal smoothing rather than individual mowing/drying dates, moisture and nutrition abstracted, conservative scythe reservation before node gathering. Rain response and all costs/labor/mix ratios are experimental balance; source references and scope are in `LL_42.md`.',
);
writeFileSync('docs/LL_42_COMPARISONS.md', out.join('\n') + '\n');
