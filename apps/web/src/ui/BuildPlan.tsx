import { getSystem, planTotals } from '@homestead/engine';
import { fmtMoney, fmtNum } from '../lib/format.ts';
import { useGame } from '../store/game.ts';
import { WhyNum } from './Why.tsx';

/** Planned but not built: ghosts on the map, their total cost and labor, built all at once or one by one (G13). */
export function BuildPlanCard() {
  const plan = useGame((s) => s.buildPlan);
  const catalog = useGame((s) => s.catalog);
  const cash = useGame((s) => s.game.cash);
  if (!plan.length) return null;
  const st = useGame.getState();
  const totals = planTotals(catalog, plan);
  return (
    <aside className="quest build-plan" aria-label="Build plan" data-testid="build-plan">
      <div className="quest-top">
        <strong>Build plan</strong>
        <button className="btn ghost small" onClick={() => st.planClear()} aria-label="Clear the build plan">
          Clear
        </button>
      </div>
      <p className="muted small">
        <WhyNum value={totals.cost} title="Build plan cost" format={fmtMoney} testId="plan-cost" /> ·{' '}
        <WhyNum value={totals.hours} title="Build plan setup labor" unit="h" /> of work
        {totals.cost.value > cash ? ' · more than your cash' : ''}
      </p>
      <ul className="plan-items">
        {plan.map((p) => (
          <li key={p.key}>
            <span>
              {getSystem(catalog, p.systemId).name} <span className="muted">({p.mode === 'diy' ? 'DIY' : 'buy'})</span>
            </span>
            <span>
              <button className="btn small" onClick={() => st.planBuild(p.key)} data-testid={`plan-build-${p.systemId}`}>
                Build
              </button>
              <button className="btn ghost small" onClick={() => st.planRemove(p.key)} aria-label="Remove from plan">
                ✕
              </button>
            </span>
          </li>
        ))}
      </ul>
      <button className="btn" onClick={() => st.planBuild('all')} data-testid="plan-build-all">
        Build all ({fmtNum(plan.length)})
      </button>
    </aside>
  );
}
