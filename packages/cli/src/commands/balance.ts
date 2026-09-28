import { catalog, type Assumptions } from '@homestead/catalog';
import { balance, type Design } from '@homestead/engine';
import { fmt, pct, table } from '../table.ts';

export function runBalance(
  design: Design,
  name: string,
  assumptions: Assumptions = catalog.assumptions,
): string {
  const r = balance(catalog, assumptions, design);
  const humans = r.humans.value;
  const lines: string[] = [];
  lines.push(
    `${name}: overall off-grid score ${pct(r.overallScore.value)} (${humans} human${humans === 1 ? '' : 's'})`,
    '',
  );
  lines.push(
    table(
      ['Need', 'Unit', 'Provided / wk', 'Needed / wk', '% covered', ''],
      r.checklist.map((c) => [c.need, c.unit, c.provided.value, c.needed.value, pct(c.pct.value), c.covered]),
    ),
  );
  const s = r.summary;
  lines.push(
    '',
    `Cost: $${fmt(s.costBuy.value)} to buy, $${fmt(s.costCheapest.value)} cheapest build; setup ${fmt(s.setupLaborHrs.value)} h`,
    `Labor: ${fmt(s.laborRequired.value)} of ${fmt(s.laborAvailable.value)} h/week; land ${fmt(s.landUsed.value)} of ${fmt(s.landAvailable.value)} sq ft (${pct(s.landUsedPct.value)})`,
    `Storage: ${fmt(s.waterDays.value)} days water, ${fmt(s.batteryDays.value)} days battery, ${fmt(s.foodStorage.value)} cu ft food`,
    `Cash: +$${fmt(s.capitalIn.value)} −$${fmt(s.capitalOut.value)} = $${fmt(s.capitalNet.value)}/week; wellbeing ${fmt(s.wellbeing.value)}`,
    `Deficits (${s.deficitCount.value}): ${(s.deficitCount.explain.notes ?? []).join(', ') || 'none'}`,
  );
  return lines.join('\n');
}
