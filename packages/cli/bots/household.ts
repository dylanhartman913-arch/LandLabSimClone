import { writeFileSync } from 'node:fs';
import { catalog } from '@homestead/catalog';
import { HEAT_HDD_MIN, SURVIVAL, initGame, placeDesign, setRole, skillBonus, stepDays, type GameEvent } from '@homestead/engine';
import { getSite } from '@homestead/catalog';
import { COMPARISONS, COMPARE_SITES, measure } from './compare.ts';
import { NEW_GAME_SETTINGS, playBot } from './run.ts';

const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0);
const rule = catalog.householdRoles!;
type Variant = 'legacy' | 'roles';

/** The matched remote-job route for the default two-adult household. */
function runOne(site: string, difficulty: 'standard' | 'real', seed: number, variant: Variant) {
  const bot = COMPARISONS.find((c) => c.id === 'job')!.variants.find((v) => v.id === 'remote')!.bot(null);
  return playBot(bot, { start: 'greenfield', site, difficulty, seed, days: 365, settings: { ...NEW_GAME_SETTINGS, householdRoles: variant === 'roles' } });
}

function rows(): string[] {
  const out = [
    '## First-year routes', '',
    'Two adults, greenfield remote-job tutorial policy, 365 days. The variants differ only in the setting: both households are all adult, so this measures skills, illness and injury on the default route. Settings otherwise match current game defaults; ordinary supplies. Standard seed 1 and Real seeds 1–3 at each site.', '',
    '| Site | Weather/seed | Variant | Survival short days | Min wellbeing | End cash | Food bought ($) | Construction hours | Illnesses | Injuries | Days lost to illness/injury | Household building / growing / gathering bonus at year end |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|',
  ];
  for (const site of COMPARE_SITES) for (const difficulty of ['standard', 'real'] as const) for (const seed of difficulty === 'standard' ? [1] : [1, 2, 3]) {
    for (const variant of ['legacy', 'roles'] as const) {
      const run = runOne(site, difficulty, seed, variant);
      const m = measure(run, catalog);
      const short = run.ledgers.filter((l) => l.wellbeing !== null && ([
        ['drinkingWater', 'Drinking water'], ['food', 'Food'], ['shelter', 'Shelter'], ['heat', 'Heated shelter'], ['sanitation', 'Sanitation'],
      ] as const).some(([key, row]) => {
        if (key === 'heat' && l.weather.hdd <= HEAT_HDD_MIN) return false;
        const n = l.needs[row];
        return (n.needed > 1e-9 ? n.delivered / n.needed : 1) < SURVIVAL[key].short - 1e-9;
      })).length;
      const people = (run.events as GameEvent[]).filter((e): e is Extract<GameEvent, { kind: 'person' }> => e.kind === 'person');
      const ill = people.filter((e) => e.event === 'ill');
      const hurt = people.filter((e) => e.event === 'injured');
      const lost = sum([...ill, ...hurt], (e) => e.days);
      const workers = run.state.instances.filter((i) => i.person && !i.person.away);
      const bonus = (k: 'building' | 'growing' | 'gathering') => variant === 'legacy' ? '—' : `${(100 * Math.max(0, ...workers.map((w) => skillBonus(rule, k, w.person!.skills?.[k] ?? 0)))).toFixed(0)}%`;
      out.push(`| ${site} | ${difficulty}/${seed} | ${variant} | ${short} | ${m.minWellbeing?.toFixed(1)} | ${run.state.cash.toFixed(0)} | ${sum(run.ledgers, (l) => l.spend?.market?.Food ?? 0).toFixed(0)} | ${sum(run.ledgers, (l) => l.labor.construction).toFixed(0)} | ${ill.length} | ${hurt.length} | ${lost} | ${bonus('building')} / ${bonus('growing')} / ${bonus('gathering')} |`);
    }
  }
  return out;
}

/** Composition alone: a fully supplied three-person household, 28 days, Front Range in April. */
function composition(): string[] {
  const out = [
    '', '## Household composition', '',
    'A household in validation-supply mode (every need met, so only composition differs) with three Bell Tents, a Tiny Wood Stove and two Composting Outhouses, Front Range from April 1 for 28 days, Standard weather. The third person is an adult, a child or an elder; legacy rules treat everyone as an adult. Weekly figures are averages.', '',
    '| Household | Rules | Food requested (kcal/week) | Drinking water requested (gal/week) | Household labor (h/week) | Paid-work cap (h/week) | Min wellbeing |',
    '|---|---|---:|---:|---:|---:|---:|',
  ];
  const id = (name: string) => catalog.systems.find((x) => x.name === name)!.id;
  for (const [label, role, roles] of [['3 adults', 'adult', false], ['3 adults', 'adult', true], ['2 adults + child', 'child', true], ['2 adults + elder', 'elder', true]] as const) {
    let s = placeDesign(catalog, initGame(catalog, getSite('front-range'), {
      ...NEW_GAME_SETTINGS, householdRoles: roles, startDay: 90, unlimitedSupply: true,
      startingStocks: { Food: 1e7, 'Drinking water': 50, Water: 100, Carbon: 1e4, 'Woody biomass': 1e4 },
    }, 1), { [id('Human Being')]: 3, [id('Bell Tent')]: 3, [id('Tiny Wood Stove')]: 1, [id('Composting Outhouse')]: 2, [id('5,000 Gallon Cistern')]: 1, [id('Drinking Water Filter')]: 2 }, 'prebuilt');
    s = { ...s, stocks: { ...s.stocks, Water: 4000 } };
    if (role !== 'adult') s = setRole(catalog, s, s.instances.filter((i) => i.person)[2]!.id, role);
    const r = stepDays(s, catalog, 28);
    const weeks = 4;
    const rr = catalog.householdRoles!.roles;
    const cap = 40 * (roles ? s.instances.filter((i) => i.person).reduce((a, i) => a + (i.person!.role === 'child' ? 0 : rr[i.person!.role ?? 'adult'].labor), 0) : 3);
    out.push(`| ${label} | ${roles ? 'roles' : 'legacy'} | ${(sum(r.ledgers, (l) => l.resources.Food?.requested ?? 0) / weeks).toFixed(0)} | ${(sum(r.ledgers, (l) => l.resources['Drinking water']?.requested ?? 0) / weeks).toFixed(1)} | ${(sum(r.ledgers, (l) => l.labor.pool) / weeks).toFixed(1)} | ${cap.toFixed(0)} | ${Math.min(...r.ledgers.map((l) => l.wellbeing ?? 100)).toFixed(1)} |`);
  }
  return out;
}

export function householdComparisons(): string {
  return [
    '# LL-36 household composition and skills comparisons', '',
    'Reproduce with `node --import tsx packages/cli/bots/household.ts`. LL-36 remains an opt-in experimental setting; nothing here changes defaults. Role shares, skill curves and risks are game balance (see `docs/LL_36.md`). The skill column shows the best individual bonus in the household at year end.', '',
    ...rows(), ...composition(),
  ].join('\n') + '\n';
}
writeFileSync('docs/LL_36_COMPARISONS.md', householdComparisons());
