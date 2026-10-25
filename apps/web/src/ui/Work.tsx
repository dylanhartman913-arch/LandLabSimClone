import { useMemo } from 'react';
import { workView, constructionView, townRecoveryView, recoveryRoute, winterPreparation, type JobId } from '@homestead/engine';
import { fmtNum, fmtMoney } from '../lib/format.ts';
import { useGame } from '../store/game.ts';
import { WhyNum } from './Why.tsx';

/** Timberborn-style work priorities: who does what first, with weekly caps and auto-gather rules (G14). */
export function Work() {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const st = useGame.getState();
  const v = useMemo(() => workView(game, catalog), [game, catalog]);
  const queue = useMemo(() => constructionView(game, catalog), [game, catalog]);
  const recovery = useMemo(() => townRecoveryView(game, catalog), [game, catalog]);
  const route = useMemo(() => recoveryRoute(game, catalog), [game, catalog]);
  const work = game.settings.work ?? {};
  const setPriority = (job: JobId, p: number) =>
    st.setGameSettings({ work: { ...work, priorities: { ...(work.priorities ?? {}), [job]: p } } });
  const setCap = (job: JobId, raw: string) => {
    const caps = { ...(work.caps ?? {}) };
    const n = Number(raw);
    if (raw === '' || !(n > 0)) delete caps[job];
    else caps[job] = n;
    st.setGameSettings({ work: { ...work, caps } });
  };
  const setAuto = (k: 'waterDays' | 'woodWeeks' | 'foodWeeks', raw: string) =>
    st.setGameSettings({ autoGather: { ...(game.settings.autoGather ?? {}), [k]: Math.max(0, Number(raw) || 0) } });
  return (
    <section className="panel wide" role="dialog" aria-label="Work priorities" data-testid="work">
      <header className="panel-head">
        <h2>Work</h2>
        <button className="btn ghost" onClick={() => st.setPanel(null)} aria-label="Close work">
          ✕
        </button>
      </header>
      <p className="muted small">
        Your household worked <WhyNum value={v.workedWeek} title="Labor worked in the last 7 days" unit="h" /> of <WhyNum value={v.poolWeek} title="Labor available in the last 7 days" unit="h" /> available; <WhyNum value={v.idleWeek} title="Idle labor in the last 7 days" unit="h" /> idle. Jobs at priority 1
        get labor first, then 2, and so on; jobs at the same priority share it. A weekly cap stops a job at that many
        hours; on a gathering job with no rule, the cap also sets how many hours a week to spend on it.
      </p>
      <p className="muted small" data-testid="labor-breakdown">
        Employment <WhyNum value={v.breakdown.employment} title="Employment hours" unit="h" /> ·
        Maintenance <WhyNum value={v.breakdown.maintenance} title="Maintenance hours" unit="h" /> ·
        Gathering <WhyNum value={v.breakdown.gathering} title="Gathering hours" unit="h" /> ·
        Construction <WhyNum value={v.breakdown.construction} title="Construction hours" unit="h" />.
        {game.settings.employmentPriority ? 'Paid employment has its own priority below upkeep by default, limited to 40 hours per adult per week.' : 'Paid jobs share the system-work priority below.'}
      </p>
      <h3>Recovery and construction</h3>
      {recovery.people.length > 0 && <div data-testid="town-recovery">
        <p>{recovery.people.join(', ')} are staying in town after wellbeing reached zero. Causes: {recovery.causes.join(', ') || 'see wellbeing history'}.</p>
        <p>Return automatically after at least {recovery.minimumStay} days away and all checks pass. Minimum stay remaining: {recovery.days} days.</p>
        <ul>{recovery.checks.map((check) => <li key={check}>{check}</li>)}</ul>
        {!recovery.checks.length && <p>Supplies and operating checks pass; waiting for the minimum stay to end.</p>}
      </div>}
      {route && <div data-testid="recovery-route">
        <h4>Recovery route</h4>
        <p className="small">Works with zero resident labor. Simulated with this game's weather and current settings for up to {route.horizon} days, then {route.stayDays} days after return. Real weather and later changes can alter it.</p>
        {route.steps.length > 0 && <ol>{route.steps.map((step) => <li key={step.label}><strong>{step.label}</strong>{step.cost > 0 ? ` · ${fmtMoney(step.cost)} now` : ''}<br /><span className="small">{step.detail}</span></li>)}</ol>}
        {route.unbuildable && <p data-testid="route-unbuildable">{route.unbuildable}</p>}
        {route.unfunded.length > 0 && <ul data-testid="route-unfunded">{route.unfunded.map((u) => <li key={u}>{u}</li>)}</ul>}
        <p data-testid="route-outcome">{route.returnDay === null
          ? `No return within ${route.horizon} days on this route. Still failing: ${route.remaining.join(' ')}`
          : `Forecast: home on day ${route.returnDay}${route.leftAgain !== null ? `, but back to town ${route.leftAgain - route.returnDay} days later; secure fuel, food and cash before booking` : route.staysHome ? `, still home ${route.stayDays} days later` : ''}. Crews ${fmtMoney(route.upfront)} now; market purchases until return about ${fmtMoney(route.marketSpend)}; cash at return about ${fmtMoney(route.cashAtReturn ?? 0)}.`}</p>
        {route.steps.length > 0 && <button className="btn small" onClick={() => st.bookRecoveryRoute(route.actions)} data-testid="book-route">Book recovery route · {fmtMoney(route.upfront)}</button>}
      </div>}
      <p className="small">{winterPreparation(game)}</p>
      <label><input type="checkbox" checked={game.settings.emergencyConstruction ?? false} onChange={(e) => st.setGameSettings({ emergencyConstruction: e.target.checked })} data-testid="emergency-construction" /> Emergency construction</label>
      <p className="muted small">Takes resident labor before employment, fetching, upkeep and other gathering. Ignores the construction share and cap. Income, safe water and sanitation may fall; turn it off after the urgent build. Paid crews use no resident labor.</p>
      <p className="small muted">Finish forecasts simulate up to 365 days under current settings, including competing jobs, weekly caps, supplies, wellbeing and possible seasonal town returns. Changes to these can change the date. Completed systems begin operating the following day.</p>
      {!queue.length && <p>No projects under construction.</p>}
      <ul data-testid="construction-queue">{queue.map((q) => <li key={q.id} data-testid={`project-${q.id}`}>
        <button className="link" onClick={() => st.openCard(game.instances.find((i) => i.id === q.id)!.systemId, q.id)}>{q.name}</button>: {fmtNum(q.remaining)} h remaining · {q.eta === null ? 'No completion within 365 days; check labor, caps, priorities and town recovery.' : `forecast ${q.eta} days`}.
        {q.coldIn !== null && <p>Heating is needed {q.coldIn === 0 ? 'now' : `in about ${q.coldIn} days`} in the average climate. Crew build: {q.quote.days} days; heat starts the following day. Fuel and actual weather still matter.</p>}
        {q.contractor ? <p>Prepaid crew booked: {q.quote.hoursPerDay} h/day; no resident labor required.</p> : <>
          <p>Outside crew: {fmtMoney(q.quote.cost)} prepaid at {fmtMoney(q.quote.rate)}/h, {q.quote.hoursPerDay} h/day, {q.quote.days} days. {q.daysGained === null ? 'Household completion is outside the forecast.' : `About ${q.daysGained} days faster than the household forecast.`} Unworked crew hours refunded on removal; completed work is not refunded.</p>
          <button className="btn small" disabled={!!q.quote.blocked} onClick={() => st.hireConstruction(q.id)} data-testid={`hire-${q.id}`}>Book crew · {fmtMoney(q.quote.cost)}</button>
          {q.quote.blocked && <p>{q.quote.blocked}</p>}
        </>}
      </li>)}</ul>
      <table className="flows-table work-table" data-testid="work-table">
          <caption>Hours worked over the last 7 measured days; caps apply to a rolling week.</caption>
        <thead>
          <tr>
            <th scope="col">Job</th>
            <th scope="col">Priority (1 = first)</th>
            <th scope="col">Hours a week, at most</th>
            <th scope="col">Last 7 days</th>
          </tr>
        </thead>
        <tbody>
          {v.rows.map((r) => (
            <tr key={r.job} data-testid={`job-${r.job}`}>
              <th scope="row">
                {r.label}
                {r.job.startsWith('gather') && (
                  <span className="muted small"> · {r.nodes ? `${r.nodes} place${r.nodes === 1 ? '' : 's'} on this land` : 'nothing on this land'}</span>
                )}
              </th>
              <td>
                <div className="prio" role="radiogroup" aria-label={`${r.label} priority`}>
                  {[1, 2, 3, 4, 5].map((p) => (
                    <button
                      key={p}
                      role="radio"
                      aria-checked={r.priority === p}
                      className={`prio-btn ${r.priority === p ? 'on' : ''}`}
                      onClick={() => setPriority(r.job, p)}
                      data-testid={`prio-${r.job}-${p}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </td>
              <td>
                <input
                  type="number"
                  min={0}
                  step="any"
                  placeholder="no cap"
                  defaultValue={r.cap ?? ''}
                  onBlur={(e) => setCap(r.job, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  aria-label={`${r.label}: hours a week at most`}
                  data-testid={`cap-${r.job}`}
                />
              </td>
              <td className="num">
                <WhyNum value={r.hoursWeek} title={`${r.label}: hours this week`} unit="h" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Auto-gather</h3>
      <p className="muted small">
        People keep these topped up from the land on their own, walking to the nearest spring, deadfall, or patch of
        greens (walking counts as work). Untreated water is boiled on the cooking fire unless you have a filter. 0 turns
        a rule off.
      </p>
      {v.warnings.map((warning) => <p className="muted small" key={warning} data-testid="water-reserve-warning">{warning}</p>)}
      <div className="mc-form">
        <label>
          Keep water above (days)
          <input type="number" min={0} defaultValue={v.auto.waterDays} onBlur={(e) => setAuto('waterDays', e.target.value)} data-testid="auto-water" />
        </label>
        <label>
          Keep firewood above (weeks of use)
          <input type="number" min={0} defaultValue={v.auto.woodWeeks} onBlur={(e) => setAuto('woodWeeks', e.target.value)} data-testid="auto-wood" />
        </label>
        <label>
          Keep food above (weeks)
          <input type="number" min={0} defaultValue={v.auto.foodWeeks} onBlur={(e) => setAuto('foodWeeks', e.target.value)} data-testid="auto-food" />
        </label>
      </div>
      <p className="muted small">Gathered this week: {fmtNum(game.ledgers.slice(-7).reduce((a, l) => a + (l.gathered?.length ?? 0), 0))} hauls.</p>
    </section>
  );
}
