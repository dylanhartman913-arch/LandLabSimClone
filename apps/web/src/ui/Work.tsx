import { useMemo } from 'react';
import { workView, type JobId } from '@homestead/engine';
import { fmtNum } from '../lib/format.ts';
import { useGame } from '../store/game.ts';
import { WhyNum } from './Why.tsx';

/** Timberborn-style work priorities: who does what first, with weekly caps and auto-gather rules (G14). */
export function Work() {
  const game = useGame((s) => s.game);
  const st = useGame.getState();
  const v = useMemo(() => workView(game), [game]);
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
        Your household worked <WhyNum value={v.poolWeek} title="Labor this week" unit="h" /> this week. Jobs at priority 1
        get labor first, then 2, and so on; jobs at the same priority share it. A weekly cap stops a job at that many
        hours; on a gathering job with no rule, the cap also sets how many hours a week to spend on it.
      </p>
      <table className="flows-table work-table" data-testid="work-table">
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
