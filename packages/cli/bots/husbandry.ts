import { writeFileSync } from 'node:fs';
import { catalog, getSite } from '@homestead/catalog';
import { applyAction, initGame, placeDesign, stepDays, type GameState } from '@homestead/engine';

const id = (name: string) => catalog.systems.find((s) => s.name === name)!.id;
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0);
const sites = ['front-range', 'laramie-wy', 'asheville-nc'];
const herd = catalog.livestockInfrastructure!;
const incubator = 'Egg Incubator (24 eggs)';
const nest = 'Broody Hen Nest Box';
const run = 'Predator-Proof Run (12 birds)';
const kit = 'Rotational Paddock Kit';
const pasture = 'Pasture (1 acre)';
const supplies = { Food: 1e6, 'Drinking water': 1000 };

function camp(site: string, systems: Record<string, number>, settings: Record<string, unknown>, seed = 1) {
  return placeDesign(
    catalog,
    initGame(
      catalog,
      getSite(site),
      { startingCash: 100000, wellbeingMult: 0, startingStocks: supplies, ...settings },
      seed,
    ),
    Object.fromEntries(Object.entries({ 'Human Being': 1, ...systems }).map(([n, c]) => [id(n), c])),
    'prebuilt',
  );
}
/** Move every instance of `name` beside the hens. */
function beside(s: GameState, name: string, dx: number): GameState {
  const hen = s.instances.find((i) => i.systemId === herd.henSystemId)!;
  return {
    ...s,
    instances: s.instances.map((i) => (i.systemId === id(name) ? { ...i, x: hen.x + dx, y: hen.y } : i)),
  };
}
const out = [
  '# LL-43 livestock lifecycle comparisons',
  '',
  'Reproduce with `node --import tsx packages/cli/bots/husbandry.ts`. Controlled equipment checks, not survival-route claims: household food, water and cash supplied, wellbeing drift disabled, `livestockLifecycle` on for hatching and predators. No defaults change.',
  '',
  '## One clutch from six hens',
  '',
  'Six mature one-hen cohorts, Standard seed 1, clutch set on June 1 (day 151), predators off for this table, 30 days. "Eggs not laid" compares the flock’s laying with the same flock without a nest box. The breeding service is the existing LL-31 option booked on one hen (outside fertile stock, $5 per hen, one chick per hen).',
  '',
  '| Site | Method | Eggs set | Chicks hatched | kWh | Eggs not laid (hen sitting) | Cash spent ($) |',
  '|---|---|---:|---:|---:|---:|---:|',
];
const noPredators = {
  ...catalog,
  livestockRules: catalog.livestockRules!.map((r) => ({ ...r, predatorRisk: 0 })),
};
for (const site of sites) {
  const base = (extra: Record<string, number>) =>
    camp(
      site,
      { Chicken: 6, 'Rooftop Solar Array (6 kW)': 1, ...extra },
      {
        livestockLifecycle: true,
        unlimitedSupply: true,
        startDay: 151,
        startingStocks: { ...supplies, Eggs: 30 },
      },
    );
  const control = stepDays(base({}), noPredators, 30);
  const laid = sum(control.ledgers, (l) => l.resources.Eggs!.produced);
  for (const method of ['incubator', 'broody hen', 'breeding service'] as const) {
    let s = base(method === 'incubator' ? { [incubator]: 1 } : method === 'broody hen' ? { [nest]: 1 } : {});
    if (method === 'broody hen') s = beside(s, nest, 8);
    const target = s.instances.find(
      (i) =>
        i.systemId ===
        (method === 'incubator' ? id(incubator) : method === 'broody hen' ? id(nest) : herd.henSystemId),
    )!;
    const cash = s.cash;
    s = applyAction(
      noPredators,
      s,
      method === 'breeding service'
        ? { at: s.calendar.absDay, kind: 'livestock', id: target.id, operation: 'breed' }
        : { at: s.calendar.absDay, kind: 'hatch', id: target.id, operation: 'set' },
    );
    const r = stepDays(s, noPredators, 30);
    const eggs = sum(r.ledgers, (l) => sum(l.hatching ?? [], (h) => h.eggsSet));
    const kWh = sum(r.ledgers, (l) => sum(l.hatching ?? [], (h) => h.kWh));
    const born = sum(r.events, (e) => (e.kind === 'livestock' && e.event === 'born' ? e.amount : 0));
    out.push(
      `| ${site} | ${method} | ${eggs} | ${born} | ${kWh.toFixed(1)} | ${method === 'broody hen' ? (laid - sum(r.ledgers, (l) => l.resources.Eggs!.produced)).toFixed(1) : '0.0'} | ${(cash - s.cash).toFixed(0)} |`,
    );
  }
}
out.push(
  '',
  '## Predator losses over a year',
  '',
  'Six mature one-hen cohorts at one spot, no guardian, January 1–December 31, Standard weather, seeds 1–3. The run sits 10 ft away and holds 12 birds, so it covers all six. Protected hens survive to be warned again, so warnings rise with the run.',
  '',
  '| Site | Seed | Protection | Warnings | Birds lost | Losses prevented | Run upkeep (h) |',
  '|---|---:|---|---:|---:|---:|---:|',
);
for (const site of sites)
  for (const seed of [1, 2, 3])
    for (const guarded of [false, true]) {
      let s = camp(
        site,
        { Chicken: 6, ...(guarded ? { [run]: 1 } : {}) },
        { livestockLifecycle: true, unlimitedSupply: true, startDay: 0 },
        seed,
      );
      if (guarded) s = beside(s, run, 10);
      const r = stepDays(s, catalog, 365);
      const count = (event: string) =>
        sum(r.events, (e) =>
          e.kind === 'livestock' && e.event === event ? (event === 'predator-loss' ? e.amount : 1) : 0,
        );
      out.push(
        `| ${site} | ${seed} | ${guarded ? 'run' : 'none'} | ${count('predator-warning')} | ${count('predator-loss')} | ${count('protected')} | ${sum(r.ledgers, (l) => l.laborBySystem[id(run)] ?? 0).toFixed(2)} |`,
      );
    }
out.push(
  '',
  '## Rotational paddocks on a 1-acre pasture',
  '',
  'One adult and a 1-acre pasture on a 2-acre parcel, January 1–December 31, Standard seed 1. The kit sits on the pasture and is moved weekly when labor allows. The existing pasture row makes a steady weekly output that site and real-year weather do not change (unchanged by this ticket), so each site gives the same pair; the kit applies to Hay and Green biomass only.',
  '',
  '| Site | Kit | Hay (lb) | Green biomass (lb) | Kit labor (h) |',
  '|---|---|---:|---:|---:|',
);
for (const site of sites)
  for (const rotated of [false, true]) {
    let s = camp(site, { [pasture]: 1, ...(rotated ? { [kit]: 1 } : {}) }, { parcelAcres: 2, startDay: 0 });
    const field = s.instances.find((i) => i.systemId === id(pasture))!;
    if (rotated)
      s = {
        ...s,
        instances: s.instances.map((i) => (i.systemId === id(kit) ? { ...i, x: field.x, y: field.y } : i)),
      };
    const r = stepDays(s, catalog, 365);
    out.push(
      `| ${site} | ${rotated ? 'yes' : 'no'} | ${sum(r.ledgers, (l) => l.resources.Hay!.produced).toFixed(1)} | ${sum(r.ledgers, (l) => l.resources['Green biomass']!.produced).toFixed(1)} | ${sum(r.ledgers, (l) => l.laborBySystem[id(kit)] ?? 0).toFixed(2)} |`,
    );
  }
out.push(
  '',
  'Limits: fertile eggs are assumed whenever a mature hen cohort is present (no rooster or fertility rate); hatch rates, incubator power, broodiness daylight, run capacity and the paddock bonus are experimental balance. Sources and scope are in `LL_43.md`.',
);
writeFileSync('docs/LL_43_COMPARISONS.md', out.join('\n') + '\n');
