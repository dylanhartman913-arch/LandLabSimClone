import { useState } from 'react';
import { NEED_KEYS } from '@homestead/catalog';
import { fmtMoney, fmtNum, fmtPct } from '../lib/format.ts';
import { useGame } from '../store/game.ts';

/** Season and year reports: coverage by month, shortages with their causes and fixes, money, labor, losses. */
export function Reports() {
  const reports = useGame((s) => s.reports);
  const [idx, setIdx] = useState<number | null>(null);
  const st = useGame.getState();
  const r = reports[idx ?? reports.length - 1];
  return (
    <section className="panel wide" role="dialog" aria-label="Reports" data-testid="report">
      <header className="panel-head">
        <h2>{r ? r.title : 'Reports'}</h2>
        {reports.length > 1 && (
          <select
            aria-label="Choose a report"
            value={idx ?? reports.length - 1}
            onChange={(e) => setIdx(Number(e.target.value))}
          >
            {reports.map((x, i) => (
              <option key={i} value={i}>
                {x.title}
              </option>
            ))}
          </select>
        )}
        <button className="btn ghost" onClick={() => st.setPanel(null)} aria-label="Close report">
          ✕
        </button>
      </header>
      {!r && <p className="empty">Reports appear at the end of each season and each year.</p>}
      {r && (
        <>
          <p>
            Overall coverage <strong>{fmtPct(r.overallScore)}</strong>, average health{' '}
            <strong>{fmtPct(r.averageHealth)}</strong>.
          </p>
          <h3>What ran short, and why</h3>
          {r.shortages.length === 0 && <p className="muted">Nothing ran short. Well done.</p>}
          <ul className="causes" data-testid="report-causes">
            {r.shortages.map((s) => (
              <li key={s.resource}>
                <div>
                  <strong>{s.resource}</strong> ({fmtPct(s.unmetShare)} of requests unmet)
                </div>
                <div className="chain" data-testid="cause-chain">
                  {s.chain}
                </div>
                {s.fixes.length > 0 && (
                  <div className="fixes">
                    Could help:{' '}
                    {s.fixes.map((f, i) => (
                      <span key={f.systemId}>
                        {i > 0 ? '; ' : ''}
                        <button className="link" onClick={() => st.openCard(f.systemId)}>
                          {f.name}
                        </button>{' '}
                        ({fmtMoney(f.cost)} {f.mode === 'diy' ? 'DIY' : 'to buy'}, makes{' '}
                        {fmtNum(f.weeklyOutput)} a week
                        {f.needs.length ? `; needs ${f.needs.join(', ')}` : ''})
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <h3>Coverage by month</h3>
          <div className="table-scroll">
            <table className="mini">
              <thead>
                <tr>
                  <th>Month</th>
                  {NEED_KEYS.map((k) => (
                    <th key={k}>{k.replace('Est. Required ', '')}</th>
                  ))}
                  <th>All</th>
                </tr>
              </thead>
              <tbody>
                {r.monthly.map((m) => (
                  <tr key={m.label}>
                    <td>{m.label}</td>
                    {NEED_KEYS.map((k) => (
                      <td
                        key={k}
                        className={m.rows[k] === null ? 'muted' : m.rows[k]! >= 0.999 ? 'ok' : 'bad'}
                      >
                        {m.rows[k] === null ? '—' : fmtPct(m.rows[k]!)}
                      </td>
                    ))}
                    <td>{fmtPct(m.overall)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="report-cols">
            <div>
              <h3>Money</h3>
              <p>
                In {fmtMoney(r.cash.in)}, running costs {fmtMoney(r.cash.out)}, purchases{' '}
                {fmtMoney(r.cash.purchases)}, refunds {fmtMoney(r.cash.refunds)}. Net{' '}
                <strong>{fmtMoney(r.cash.net)}</strong>.
              </p>
              <h3>Losses</h3>
              <p>
                Spilled power {fmtNum(r.spilledPower)} kWh.
                {Object.keys(r.spoiled).length > 0 &&
                  ` Spoiled: ${Object.entries(r.spoiled)
                    .map(([k, v]) => `${fmtNum(v)} ${k}`)
                    .join(', ')}.`}
              </p>
            </div>
            <div>
              <h3>Labor by system</h3>
              <ul className="labor">
                <li>
                  Construction <span>{fmtNum(r.constructionHours)} h</span>
                </li>
                {r.laborBySystem.slice(0, 8).map((l) => (
                  <li key={l.systemId}>
                    {l.name} <span>{fmtNum(l.hours)} h</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
