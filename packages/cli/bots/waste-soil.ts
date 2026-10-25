import { writeFileSync } from 'node:fs';
import { catalog, getSite } from '@homestead/catalog';
import { initGame, placeDesign, stepDays, type DayLedger, type GameState } from '@homestead/engine';

const id = (name: string) => catalog.systems.find((s) => s.name === name)!.id;
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0);
const sites = ['front-range', 'laramie-wy', 'asheville-nc'];
const supplies = { Food: 1e7, 'Drinking water': 1000, Water: 20000 };

function camp(
  site: string,
  systems: Record<string, number>,
  settings: Record<string, unknown> = {},
  stocks: Record<string, number> = {},
) {
  const s = placeDesign(
    catalog,
    initGame(
      catalog,
      getSite(site),
      {
        startingCash: 100000,
        wellbeingMult: 0,
        startDay: 0,
        startingStocks: { ...supplies, ...stocks },
        ...settings,
      },
      1,
    ),
    Object.fromEntries(
      Object.entries({ 'Human Being': 1, 'Bell Tent': 1, '5,000 Gallon Cistern': 1, 'Municipal Water Hookup': 1, ...systems }).map(
        ([n, c]) => [id(n), c],
      ),
    ),
    'prebuilt',
  );
  // One spot, so the range rules are easy to read.
  return { ...s, instances: s.instances.map((i) => ({ ...i, x: 80, y: 80 })) };
}
/** Step a year, summing one system's realized daily inputs and outputs from its group record. */
function year(start: GameState, name: string) {
  let s = start;
  const ledgers: DayLedger[] = [];
  const ins: Record<string, number> = {};
  const outs: Record<string, number> = {};
  for (let day = 0; day < 365; day++) {
    s = stepDays(s, catalog, 1).state;
    ledgers.push(s.ledgers.at(-1)!);
    const k = Object.keys(s.lastDay).find((key) => key.startsWith(`${id(name)}|`));
    if (!k) continue;
    for (const [r, v] of Object.entries(s.lastDay[k]!.inputs)) ins[r] = (ins[r] ?? 0) + v.received;
    for (const [r, v] of Object.entries(s.lastDay[k]!.outputs)) outs[r] = (outs[r] ?? 0) + v;
  }
  return { state: s, ledgers, ins, outs };
}
const res = (ls: DayLedger[], r: string, k: 'produced' | 'consumed') =>
  sum(ls, (l) => l.resources[r]?.[k] ?? 0);
const labor = (ls: DayLedger[], name: string) => sum(ls, (l) => l.laborBySystem[id(name)] ?? 0);

const out = [
  '# LL-44 waste, soil and sanitation comparisons',
  '',
  'Reproduce with `node --import tsx packages/cli/bots/waste-soil.ts`. Controlled equipment checks, not survival-route claims: household food, water and cash supplied, wellbeing drift disabled, Standard weather, seed 1, January 1–December 31. No defaults change.',
  '',
  '## Manure to compost',
  '',
  'A 12-hen coop (18 lb manure/week) with a windrow and sawdust for carbon. The coop’s feed, greens and grubs are stocked for the year. Every fixture has a municipal water hookup so water never limits.',
  '',
  '| Site | Windrow | Manure made (lb) | Manure used (lb) | Carbon used by windrow (lb) | Compost made (lb) | Windrow labor (h) |',
  '|---|---|---:|---:|---:|---:|---:|',
];
for (const site of sites)
  for (const built of [false, true]) {
    const r = year(
      camp(
        site,
        {
          'Chicken Coop (12 hens)': 1,
          'Sawmill Sawdust Pickup': 1,
          ...(built ? { 'Manure Windrow': 1 } : {}),
        },
        {}, { 'Chicken feed': 1000, 'Green biomass': 300, Grubs: 120 },
      ),
      'Manure Windrow',
    );
    const windrowCarbon = r.ins.Carbon ?? 0;
    out.push(
      `| ${site} | ${built ? 'yes' : 'no'} | ${res(r.ledgers, 'Manure', 'produced').toFixed(0)} | ${res(r.ledgers, 'Manure', 'consumed').toFixed(0)} | ${windrowCarbon.toFixed(0)} | ${res(r.ledgers, 'Compost', 'produced').toFixed(0)} | ${labor(r.ledgers, 'Manure Windrow').toFixed(1)} |`,
    );
  }
out.push(
  '',
  'Inputs are the windrow’s own realized daily draws. The 18 lb/week coop supplies 60% of its 30 lb manure input, so it runs at that share.',
  '',
  '## Carbon for a composting outhouse',
  '',
  'One adult, a composting outhouse and no starting carbon. Sanitation met is delivered ÷ needed over the year.',
  '',
  '| Site | Carbon source | Sanitation met | Carbon made (lb) | Source labor (h) | Source cash ($) |',
  '|---|---|---:|---:|---:|---:|',
);
for (const site of sites)
  for (const source of ['none', 'Leaf Litter Gathering', 'Sawmill Sawdust Pickup']) {
    const s = camp(
      site,
      { 'Composting Outhouse': 1, ...(source === 'none' ? {} : { [source]: 1 }) },
      {},
      { Carbon: 0 },
    );
    const r = year(s, source === 'none' ? 'Composting Outhouse' : source);
    const met =
      sum(r.ledgers, (l) => l.needs.Sanitation.delivered) / sum(r.ledgers, (l) => l.needs.Sanitation.needed);
    const cash = source === 'none' ? 0 : (r.ins.Capital ?? 0);
    out.push(
      `| ${site} | ${source === 'none' ? 'none' : source} | ${(met * 100).toFixed(1)}% | ${res(r.ledgers, 'Carbon', 'produced').toFixed(0)} | ${source === 'none' ? '0.0' : labor(r.ledgers, source).toFixed(1)} | ${cash.toFixed(0)} |`,
    );
  }
out.push(
  '',
  'Without a source the outhouse never runs. Either source restores it to the same level; the remaining gap is the outhouse’s existing organic-waste timing, not carbon.',
  '',
  '## Off-season cover crop on a tired bed',
  '',
  'Soil fertility on. One raised bed starting at fertility 0.5 with no compost, with and without a seeding kit beside it, January 1–December 31. The kit has no sowing from a previous year, so it sows in late summer and only the November–December rest days gain this year.',
  '',
  '| Site | Seeding kit | Fertility Dec 31 | Fertility added by cover crop | Vegetables (lb) | Seeds used (oz) |',
  '|---|---|---:|---:|---:|---:|',
);
for (const site of sites)
  for (const kit of [false, true]) {
    const s0 = camp(
      site,
      { 'Raised Beds (24 sq ft)': 1, ...(kit ? { 'Cover Crop Seeding': 1 } : {}) },
      { soilFertility: true },
      { Seeds: 50 },
    );
    const s = {
      ...s0,
      instances: s0.instances.map((i) =>
        i.systemId === id('Raised Beds (24 sq ft)') ? { ...i, fertility: 0.5 } : i,
      ),
    };
    const r = stepDays(s, catalog, 365);
    const bed = r.state.instances.find((i) => i.systemId === id('Raised Beds (24 sq ft)'))!;
    out.push(
      `| ${site} | ${kit ? 'yes' : 'no'} | ${bed.fertility!.toFixed(3)} | ${sum(r.ledgers, (l) => sum(l.fertility ?? [], (f) => f.cover)).toFixed(3)} | ${res(r.ledgers, 'Vegetables fruit fiber herbs', 'produced').toFixed(1)} | ${res(r.ledgers, 'Seeds', 'consumed').toFixed(2)} |`,
    );
  }
out.push(
  '',
  '## Laundry station',
  '',
  'One adult, a laundry station and a solar hot water heater, one year.',
  '',
  '| Site | Hot water to laundry (gal) | Greywater from laundry (gal) | Laundry wellbeing (points) | Laundry labor (h) |',
  '|---|---:|---:|---:|---:|',
);
for (const site of sites) {
  const r = year(camp(site, { 'Laundry Station': 1, 'Solar Hot Water Heater': 1 }), 'Laundry Station');
  out.push(
    `| ${site} | ${(r.ins['Hot water'] ?? 0).toFixed(0)} | ${(r.outs.Greywater ?? 0).toFixed(0)} | ${(r.outs.Wellbeing ?? 0).toFixed(0)} | ${labor(r.ledgers, 'Laundry Station').toFixed(1)} |`,
  );
}
out.push(
  '',
  'Limits: leaf litter and sawdust arrive evenly through the year; the windrow has no pile temperature or curing time; the seeding kit has no species, termination date or nitrogen accounting; laundry soap and drying are abstracted. Quantities are experimental balance; scope is in `LL_44.md`.',
);
writeFileSync('docs/LL_44_COMPARISONS.md', out.join('\n') + '\n');
