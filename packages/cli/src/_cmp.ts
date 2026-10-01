import { catalog } from '@homestead/catalog';
import { balanceFeasible, balancePotential, designForGame, gameFromDesign, stepDays, summarizeLedgers } from '@homestead/engine';
import { readFileSync } from 'node:fs';
for (const f of ['starter', 'offgrid-cabin-family', 'suburban-baseline']) {
  const file = JSON.parse(readFileSync(`designs/${f}.json`, 'utf8'));
  let g = gameFromDesign(catalog, file, { seed: 1, weatherMode: 'average' });
  g = stepDays(g, catalog, 365).state;
  const y2 = stepDays(g, catalog, 365);
  const t = summarizeLedgers(y2.ledgers, catalog);
  const d = designForGame(y2.state, catalog);
  const fe = balanceFeasible(catalog, catalog.assumptions, d);
  const po = balancePotential(catalog, catalog.assumptions, d);
  console.log(`== ${f}  time ${t.overallScore.toFixed(3)} feasible ${fe.overallScore.value.toFixed(3)} potential ${po.overallScore.value.toFixed(3)} iters ${fe.iterations}`);
  for (const r of t.checklist) {
    const fr = fe.checklist.find((x) => x.need === r.need)!;
    const pr = po.checklist.find((x) => x.need === r.need)!;
    console.log(r.need.padEnd(20), 'T', r.provided.toFixed(0).padStart(9), r.potential.toFixed(0).padStart(9), (r.pct*100).toFixed(1).padStart(6), '| F', fr.provided.value.toFixed(0).padStart(9), (fr.pct.value*100).toFixed(1).padStart(6), '| P', pr.provided.value.toFixed(0).padStart(9), (pr.pct.value*100).toFixed(1).padStart(6), ' need', r.needed.toFixed(0), fr.needed.value.toFixed(0));
  }
  console.log(Object.values(fe.systems).filter(s=>s.satisfaction<1).map(s=>`${s.name}: ${s.status} @${s.curtailedAt}`).join('\n'));
}
