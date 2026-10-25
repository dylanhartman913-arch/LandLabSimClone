import { writeFileSync } from 'node:fs';
import { catalog, getSite, type Catalog, type RiskKind } from '@homestead/catalog';
import {
  initGame,
  manageFinance,
  placeDesign,
  serviceSystem,
  smokeExposure,
  stepDays,
  type GameState,
  type RiskThreat,
} from '@homestead/engine';
import { COMPARISONS, COMPARE_SITES, measure } from './compare.ts';
import { adaptUpgraderBot } from './adaptUpgrader.ts';
import { NEW_GAME_SETTINGS, playBot } from './run.ts';

const out = [
  '# LL-38 risk-event comparisons',
  '',
  'Reproduce with `node --import tsx packages/cli/bots/risks.ts`. Experimental game balance; defaults unchanged. Matched 365-day runs across three sites, Standard seed 1 and Real seeds 1–3, for the greenfield remote-job and adapt-upgrader routes. Wear, livestock lifecycle and Finance are enabled in both variants; only `riskEvents` differs. Bots keep their existing decisions and do not react to new warnings. This measures exposure, not an optimized risk-response policy. Independent risk draws leave the climate and predator streams unchanged.',
  '',
  '| Route | Site | Weather/seed | Risk gate | Survival short days | Min wellbeing | End cash | Warnings | Starts | Smoke days | Road-closure days | Outage days |',
  '|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
];
for (const route of ['greenfield', 'adapt'] as const)
  for (const site of COMPARE_SITES)
    for (const difficulty of ['standard', 'real'] as const)
      for (const seed of difficulty === 'standard' ? [1] : [1, 2, 3])
        for (const enabled of [false, true]) {
          const bot =
            route === 'adapt'
              ? adaptUpgraderBot()
              : COMPARISONS.find((c) => c.id === 'job')!
                  .variants.find((v) => v.id === 'remote')!
                  .bot(null);
          const r = playBot(bot, {
            start: route,
            site,
            difficulty,
            seed,
            days: 365,
            settings: {
              ...NEW_GAME_SETTINGS,
              wearAndRepair: true,
              livestockLifecycle: true,
              finance: true,
              riskEvents: enabled,
            },
          });
          const m = measure(r, catalog);
          const count = (kind: RiskKind) =>
            r.ledgers.filter((l) => l.risks?.some((t) => t.kind === kind)).length;
          out.push(
            `| ${route} | ${site} | ${difficulty}/${seed} | ${enabled ? 'on' : 'off'} | ${m.essentialShortDays} | ${m.minWellbeing.toFixed(1)} | ${r.state.cash.toFixed(0)} | ${r.events.filter((e) => e.kind === 'risk' && e.phase === 'warning').length} | ${r.events.filter((e) => e.kind === 'risk' && e.phase === 'started').length} | ${count('smoke')} | ${count('blizzard')} | ${count('outage')} |`,
          );
        }

const quiet = {
  ...catalog,
  riskEvents: {
    ...catalog.riskEvents!,
    events: Object.fromEntries(
      Object.entries(catalog.riskEvents!.events).map(([k, v]) => [k, { ...v, chance: 0 }]),
    ),
  },
} as Catalog;
const id = (name: string) => catalog.systems.find((s) => s.name === name)!.id;
const base = (counts: Record<string, number>, unlimitedSupply = true) =>
  placeDesign(
    quiet,
    initGame(
      quiet,
      getSite('front-range'),
      {
        ...NEW_GAME_SETTINGS,
        riskEvents: true,
        wearAndRepair: true,
        finance: true,
        startDay: 170,
        startingCash: 10000,
        unlimitedSupply,
        startingStocks: { Food: 30000, Water: 500, 'Drinking water': 50, 'Woody biomass': 1000 },
      },
      38,
    ),
    Object.fromEntries(Object.entries(counts).map(([name, n]) => [id(name), n])),
    'prebuilt',
  );
const threat = (s: GameState, kind: RiskKind, targetId?: string, startsAt = 1): GameState => {
  const t: RiskThreat = {
    id: `${kind}:controlled`,
    kind,
    warnedAt: 0,
    startsAt,
    endsAt: startsAt + 4,
    ...(targetId ? { targetId } : {}),
  };
  return {
    ...s,
    calendar: { ...s.calendar, absDay: 1 },
    risks: { threats: [t], readiness: s.risks?.readiness ?? {} },
  };
};
out.push(
  '',
  '## Controlled mitigations',
  '',
  'Fixed event schedules isolate each effect. Validation supply is used for garden/repair/refuge/well production tests, so missing inputs cannot masquerade as an event effect; road and grid checks use ordinary supply. These are game scenarios, not empirical hazard forecasts.',
  '',
  '| Risk | Scenario | Result |',
  '|---|---|---|',
);
for (const kind of ['pests', 'disease'] as const) {
  let s = base({ 'Raised Beds (24 sq ft)': 1, [kind === 'pests' ? 'Bat House' : 'Compost Piles']: 1 });
  const target = s.instances.find((i) => i.systemId === id('Raised Beds (24 sq ft)'))!;
  s = {
    ...s,
    instances: s.instances.map((i) => (i.id !== target.id ? { ...i, x: target.x + 10, y: target.y } : i)),
  };
  s = stepDays(s, quiet, 1).state;
  for (const protection of [false, true]) {
    const ready = threat(s, kind, target.id);
    if (!protection) ready.risks = { ...ready.risks!, readiness: {} };
    const r = stepDays(ready, quiet, 1);
    out.push(
      `| ${kind} | ${protection ? 'Operating defense within 10 ft' : 'No operating defense'} | ${r.ledgers[0]!.resources['Vegetables fruit fiber herbs']!.produced.toFixed(3)} lb harvest/day |`,
    );
  }
}
let s = base({ 'Human Being': 1, 'Bell Tent': 1 });
const asset = s.instances.find((i) => i.systemId === id('Bell Tent'))!;
s = { ...s, instances: s.instances.map((i) => (i.id === asset.id ? { ...i, condition: 0.5 } : i)) };
s = manageFinance(quiet, s, 'insurance', 1);
for (const repair of [false, true]) {
  let warned = threat(s, 'breakdown', asset.id, 7);
  if (repair) warned = serviceSystem(quiet, warned, asset.id);
  const r = stepDays(warned, quiet, 7);
  out.push(
    `| breakdown | ${repair ? 'Repair during warning' : 'No repair, insured'} | End condition ${r.state.instances.find((i) => i.id === asset.id)!.condition!.toFixed(3)}; insurance paid $${r.ledgers.reduce((a, l) => a + (l.finance?.claim ?? 0), 0).toFixed(2)}; averted ${r.events.some((e) => e.kind === 'risk' && e.phase === 'averted')} |`,
  );
}
for (const refuge of [false, true]) {
  let state = base({ 'Human Being': 2, 'Average Suburban Home': 1 });
  state = stepDays(state, quiet, 1).state;
  state = threat(state, 'smoke');
  if (!refuge) state.risks = { ...state.risks!, readiness: {} };
  out.push(
    `| smoke | ${refuge ? 'Operating enclosed home' : 'No operating refuge'} | ${smokeExposure(
      quiet,
      state,
      state.instances.find((i) => i.person)!,
    ).toFixed(
      3,
    )} air-exposure wellbeing points/day before difficulty; cooling demand adds ${quiet.riskEvents!.smokeCdd} CDD |`,
  );
}
for (const reserves of [false, true]) {
  let state = base({ 'Human Being': 1, 'Big Box Grocery Store': 1 }, false);
  state = { ...state, stocks: { ...state.stocks, Food: reserves ? 10000 : 0 } };
  const r = stepDays(threat(state, 'blizzard'), quiet, 3);
  out.push(
    `| blizzard | ${reserves ? 'Stored food reserve' : 'No food reserve'} | Food delivered ${r.ledgers.reduce((a, l) => a + l.needs.Food.delivered, 0).toFixed(0)} kcal in 3 days; delivery spending $${r.ledgers.reduce((a, l) => a + l.spend.delivery + (l.spend.backstop.Food ?? 0), 0).toFixed(2)} |`,
  );
}
for (const backup of [false, true]) {
  const state = base(
    {
      'Human Being': 1,
      'Central Power Plant (Coal / NatGas / Nuclear)': 1,
      ...(backup ? { 'Portable Gas Generator (3.5 kW)': 1 } : {}),
    },
    false,
  );
  const fueled = { ...state, stocks: { ...state.stocks, Gasoline: 50 } };
  const r = stepDays(threat(fueled, 'outage'), quiet, 1);
  out.push(
    `| outage | ${backup ? 'Fueled portable generator' : 'Grid only'} | Electricity produced ${r.ledgers[0]!.resources.Electricity!.produced.toFixed(2)} kWh; grid purchased ${r.ledgers[0]!.resources.Electricity!.purchased!.toFixed(2)} kWh |`,
  );
}
for (const drawdown of [false, true]) {
  let state = base({
    Well: 1,
    'Hand Pump Well': 1,
    'Rainwater Collection System + Cistern (550 Gallons)': 1,
  });
  state = { ...state, calendar: { ...state.calendar, absDay: 1 } };
  if (drawdown) state = threat(state, 'drawdown');
  const r = stepDays(state, quiet, 1);
  out.push(
    `| drawdown | ${drawdown ? 'Depleted wells; rain collection unchanged' : 'No drawdown'} | Water produced ${r.ledgers[0]!.resources.Water!.produced.toFixed(2)} gal/day |`,
  );
}
out.push(
  '',
  'Predator warning, guardian/secure-housing mitigation and losses remain the LL-31 mechanism; the LL-38 regression checks its draws and results match with this gate off/on. No second predator lottery is added.',
);
writeFileSync('docs/LL_38_COMPARISONS.md', out.join('\n') + '\n');
