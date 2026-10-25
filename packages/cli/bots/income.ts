import { writeFileSync } from 'node:fs';
import { catalog, getQuestLine, getSite } from '@homestead/catalog';
import { initGame, newTutorial, placeDesign, queueTrade, stepDays, type GameState } from '@homestead/engine';

const id = (name: string) => catalog.systems.find((s) => s.name === name)!.id;
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0);
const sites = ['front-range', 'laramie-wy', 'asheville-nc'];
const VEG = 'Vegetables fruit fiber herbs';
const csa = 'CSA Share Program (4 half shares)';
const spinning = 'Spinning Wheel and Loom';
const supplies = { Food: 1e7, 'Drinking water': 1000 };

function camp(
  site: string,
  systems: Record<string, number>,
  stocks: Record<string, number>,
  settings: Record<string, unknown> = {},
) {
  return placeDesign(
    catalog,
    initGame(
      catalog,
      getSite(site),
      {
        sellingAndTrade: true,
        wellbeingMult: 0,
        startDay: 0,
        startingCash: 10000,
        startingStocks: { ...supplies, ...stocks },
        ...settings,
      },
      1,
    ),
    Object.fromEntries(Object.entries({ 'Human Being': 1, ...systems }).map(([n, c]) => [id(n), c])),
    'prebuilt',
  );
}
const finished = (s: GameState): GameState => ({
  ...s,
  tutorial: { ...newTutorial('greenfield', 0), current: getQuestLine('greenfield').quests.length },
});

const out = [
  '# LL-46 income and trade comparisons',
  '',
  'Reproduce with `node --import tsx packages/cli/bots/income.ts`. Controlled equipment checks, not survival-route claims: household food, water and cash supplied, wellbeing drift disabled, Standard weather, seed 1, January 1–December 31, Selling and trade on. No defaults change.',
  '',
  '## A CSA season',
  '',
  'One adult, a CSA and two root cellars, for a year from the site’s first growing day. "Fully supplied" backfills produce from unlimited supply; "half the season" starts with 312 lb of stored produce, half the season’s 624 lb of boxes; "no produce" has none. Net is revenue minus make-good, before the $150 purchase. Growing-season flows keep the workbook’s annual total, so every site promises the same $2,346 over its own season length.',
  '',
  '| Site | Supply | Season (days) | Boxes packed | Revenue ($) | Make-good ($) | Net ($) | Packing labor (h) |',
  '|---|---|---:|---:|---:|---:|---:|---:|',
];
for (const site of sites) {
  // A season's boxes total the workbook's 12 lb × 52 weeks, spread over the local growing season.
  const promisedVeg = 12 * 52;
  const firstGrowing = stepDays(camp(site, {}, {}), catalog, 365).ledgers.find((l) => l.weather.growing)!.day;
  for (const supply of ['fully supplied', 'half the season', 'no produce'] as const) {
    const s = camp(
      site,
      { [csa]: 1, 'Root Cellar': 2 },
      { [VEG]: supply === 'half the season' ? promisedVeg / 2 : 0 },
      { startDay: firstGrowing, ...(supply === 'fully supplied' ? { unlimitedSupply: true } : {}) },
    );
    const r = stepDays(s, catalog, 365);
    const days = r.ledgers.flatMap((l) => l.csa ?? []);
    const revenue = sum(days, (c) => c.revenue);
    const makeGood = sum(days, (c) => c.makeGood);
    const packed = sum(days, (c) => c.share) / Math.max(1, days.length);
    out.push(
      `| ${site} | ${supply} | ${days.length} | ${(packed * 100).toFixed(1)}% | ${revenue.toFixed(0)} | ${makeGood.toFixed(0)} | ${(revenue - makeGood).toFixed(0)} | ${sum(r.ledgers, (l) => l.laborBySystem[id(csa)] ?? 0).toFixed(1)} |`,
    );
  }
}
out.push(
  '',
  'A full season earns $45 a growing-season week. The make-good means a CSA that cannot fill its boxes loses more than a stand that simply sells less: with no produce it pays out half the promised revenue. The half-season stock lasts about three weeks, not half the season, because the household eats its most perishable food first (about 13 lb of produce a day here, alongside the CSA’s 4). Boxes come before meals each day, but nothing reserves produce for later boxes.',
  '',
  '## Spinning a year of wool',
  '',
  'One adult and a spinning wheel with 26 lb of stored wool (about a year from a three-sheep flock), then every woolen good sold at the 50% sale rate. Compared with selling the same wool raw at 50% of its $4/lb reference.',
  '',
  '| Site | Wool spun (lb) | Woolen goods made (lb) | Spinning labor (h) | Goods sale value at 50% ($) | Raw wool sale value at 50% ($) | Value added per hour ($) |',
  '|---|---:|---:|---:|---:|---:|---:|',
);
for (const site of sites) {
  const r = stepDays(camp(site, { [spinning]: 1 }, { Wool: 26 }), catalog, 365);
  const spun = sum(r.ledgers, (l) => l.resources.Wool!.consumed);
  const goods = sum(r.ledgers, (l) => l.resources['Woolen goods']!.produced);
  const hours = sum(r.ledgers, (l) => l.laborBySystem[id(spinning)] ?? 0);
  const goodsValue = goods * 25 * 0.5;
  const rawValue = spun * 4 * 0.5;
  out.push(
    `| ${site} | ${spun.toFixed(2)} | ${goods.toFixed(2)} | ${hours.toFixed(1)} | ${goodsValue.toFixed(2)} | ${rawValue.toFixed(2)} | ${((goodsValue - rawValue) / hours).toFixed(2)} |`,
  );
}
out.push(
  '',
  '## Spare work for Ruth',
  '',
  'One adult after the tutorial, a standing order of 4 hours of spare work a week for chicken feed, filled as spare labor allows, 12 weeks from June 21. The household has no other work, so the order fills each time it is renewed.',
  '',
  '| Site | Hours worked | Chicken feed received (lb) | Goods value ($) | Cash spent ($) |',
  '|---|---:|---:|---:|---:|',
);
for (const site of sites) {
  let s = finished(camp(site, {}, {}, { startDay: 172 }));
  const cash = s.cash;
  let hours = 0;
  let feed = 0;
  for (let week = 0; week < 12; week++) {
    s = queueTrade(catalog, s, 'Labor', 4, 0, 'Chicken feed');
    const r = stepDays(s, catalog, 7);
    s = r.state;
    for (const l of r.ledgers)
      for (const t of l.trades ?? [])
        if (t.resource === 'Labor') {
          hours += t.amount;
          feed += t.receivedAmount ?? 0;
        }
  }
  out.push(
    `| ${site} | ${hours.toFixed(1)} | ${feed.toFixed(1)} | ${(hours * catalog.incomeTrade!.laborBarterValuePerHour).toFixed(0)} | ${(cash - s.cash).toFixed(0)} |`,
  );
}
out.push(
  '',
  'Limits: CSA members never cancel or renew, there is no box mix or delivery route, and produce is pooled; spinning abstracts washing, carding and dyeing into one rate; Ruth has unlimited goods and work. Prices and the make-good are experimental balance; scope is in `LL_46.md`.',
);
writeFileSync('docs/LL_46_COMPARISONS.md', out.join('\n') + '\n');
