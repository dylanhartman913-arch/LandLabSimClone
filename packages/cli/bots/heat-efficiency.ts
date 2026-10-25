import { writeFileSync } from 'node:fs';
import { catalog, getSite } from '@homestead/catalog';
import { initGame, placeDesign, stepDays, type DayLedger, type GameState } from '@homestead/engine';

const id = (name: string) => catalog.systems.find((s) => s.name === name)!.id;
const sites = ['front-range', 'laramie-wy', 'asheville-nc'];
const supplies = { Food: 1e7, 'Drinking water': 1000, 'Woody biomass': 20000, Propane: 500 };
const tent = 'Canvas Wall Tent + Stove Jack';
const house = 'Tiny House on Wheels';

function camp(site: string, systems: Record<string, number>, startDay: number) {
  const s = placeDesign(
    catalog,
    initGame(catalog, getSite(site), { startingCash: 100000, wellbeingMult: 0, startDay, startingStocks: supplies }, 1),
    Object.fromEntries(
      Object.entries({ 'Human Being': 1, '5,000 Gallon Cistern': 1, 'Municipal Water Hookup': 1, ...systems }).map(([n, c]) => [id(n), c]),
    ),
    'prebuilt',
  );
  // One spot: host modifiers sit on their shelter.
  return { ...s, instances: s.instances.map((i) => ({ ...i, x: 80, y: 80 })) };
}

/** Step `days`, summing named systems' realized daily inputs and outputs from their group records. */
function measure(start: GameState, days: number, names: string[]) {
  let s = start;
  const ledgers: DayLedger[] = [];
  const ins: Record<string, Record<string, { requested: number; received: number }>> = {};
  const outs: Record<string, Record<string, number>> = {};
  for (let d = 0; d < days; d++) {
    s = stepDays(s, catalog, 1).state;
    ledgers.push(s.ledgers.at(-1)!);
    for (const name of names) {
      const k = Object.keys(s.lastDay).find((key) => key.startsWith(`${id(name)}|`));
      if (!k) continue;
      const i = (ins[name] ??= {});
      const o = (outs[name] ??= {});
      for (const [r, v] of Object.entries(s.lastDay[k]!.inputs)) {
        const t = (i[r] ??= { requested: 0, received: 0 });
        t.requested += v.requested;
        t.received += v.received;
      }
      for (const [r, v] of Object.entries(s.lastDay[k]!.outputs)) o[r] = (o[r] ?? 0) + v;
    }
  }
  return { ledgers, ins, outs };
}
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

const out = [
  '# LL-45 heat, hot water and shelter efficiency comparisons',
  '',
  'Reproduce with `node --import tsx packages/cli/bots/heat-efficiency.ts`. Controlled equipment checks, not survival-route claims: household food, water, firewood and cash supplied, wellbeing drift disabled, Standard weather, seed 1. No defaults change.',
  '',
  '## Winter liner on the starter tent',
  '',
  'One adult in the greenfield starter tent with its tiny wood stove and wool bedding, December 1 to February 28 (90 days). Heat need is the tent’s requested heat after bedding (and the liner).',
  '',
  '| Site | Liner | Tent heat need (MBTU) | Heat met | Stove wood (lb) |',
  '|---|---|---:|---:|---:|',
];
for (const site of sites)
  for (const lined of [false, true]) {
    const r = measure(
      camp(site, { [tent]: 1, 'Tiny Wood Stove': 1, 'Wool Blankets & Sleeping Bags': 1, ...(lined ? { 'Canvas Tent Winter Liner': 1 } : {}) }, 334),
      90,
      [tent, 'Tiny Wood Stove'],
    );
    const heat = r.ins[tent]!.Heat!;
    out.push(
      `| ${site} | ${lined ? 'yes' : 'no'} | ${(heat.requested / 1e6).toFixed(2)} | ${pct(heat.received / heat.requested)} | ${r.ins['Tiny Wood Stove']!['Woody biomass']!.received.toFixed(0)} |`,
    );
  }
out.push(
  '',
  'The tiny stove burns its catalog wood whether or not the tent needs all its heat (the stove also cooks), so the liner shows up as more of the need met, not as wood saved. With the bedding in place the remaining need is already small.',
  '',
  '## Draft-proofing a tiny house',
  '',
  'One adult in a tiny house on wheels, January 1–December 31, no heater or cooler, so the table shows the need itself.',
  '',
  '| Site | Draft-proofed | Heat need (MBTU/yr) | Cooling need (MBTU/yr) |',
  '|---|---|---:|---:|',
);
for (const site of sites)
  for (const sealed of [false, true]) {
    const r = measure(camp(site, { [house]: 1, ...(sealed ? { 'Draft-Proofing Kit (small shelter)': 1 } : {}) }, 0), 365, [house]);
    out.push(
      `| ${site} | ${sealed ? 'yes' : 'no'} | ${((r.ins[house]!.Heat?.requested ?? 0) / 1e6).toFixed(2)} | ${((r.ins[house]!.Cooling?.requested ?? 0) / 1e6).toFixed(2)} |`,
    );
  }
out.push(
  '',
  '## Hot water for one adult',
  '',
  'One adult (40 gal hot water/week) in a tiny house, January 1–December 31. Hot water met is delivered ÷ requested from the daily ledgers; heat made is the boiler’s output in the heating season.',
  '',
  '| Site | Water heater | Hot water met | Wood (lb/yr) | Propane (gal/yr) | Boiler heat made (MBTU/yr) |',
  '|---|---|---:|---:|---:|---:|',
);
const heaters = ['none', 'Wood Boiler with Water Jacket', 'Propane Tankless Water Heater', 'Solar Hot Water Heater'];
for (const site of sites)
  for (const heater of heaters) {
    const names = heater === 'none' ? [] : [heater];
    const r = measure(camp(site, { [house]: 1, ...(heater === 'none' ? {} : { [heater]: 1 }) }, 0), 365, names);
    const req = r.ledgers.reduce((n, l) => n + l.resources['Hot water']!.requested, 0);
    const unmet = r.ledgers.reduce((n, l) => n + l.resources['Hot water']!.unmet, 0);
    const i = heater === 'none' ? {} : r.ins[heater]!;
    out.push(
      `| ${site} | ${heater} | ${pct(1 - unmet / req)} | ${(i['Woody biomass']?.received ?? 0).toFixed(0)} | ${(i.Propane?.received ?? 0).toFixed(1)} | ${heater === 'Wood Boiler with Water Jacket' ? ((r.outs[heater]!.Heat ?? 0) / 1e6).toFixed(2) : '—'} |`,
    );
  }
out.push(
  '',
  'Limits: the liner and draft-proofing are fixed heat-need multipliers, with no condensation, ventilation or wear beyond LL-28; the boiler’s summer heat is simply unused; hot water stays a comfort need outside the coverage score. Values are experimental balance; scope is in `LL_45.md`.',
);
writeFileSync('docs/LL_45_COMPARISONS.md', out.join('\n') + '\n');
