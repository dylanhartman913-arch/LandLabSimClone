import { useMemo, useState } from 'react';
import {
  checklistView,
  designBalance,
  designCounts,
  getSystem,
  resourceWeek,
  type ChecklistMode,
} from '@homestead/engine';
import type { NeedKey } from '@homestead/catalog';
import { fmtNum, fmtPct } from '../lib/format.ts';
import { sparkPoints } from '../lib/sparkline.ts';
import { useGame } from '../store/game.ts';
import { ScoreRing } from './ScoreRing.tsx';
import { SystemIcon } from './SystemIcon.tsx';
import { WhyNum } from './Why.tsx';

const MODES: { id: ChecklistMode; label: string }[] = [
  { id: 'average', label: 'Average year' },
  { id: 'season', label: 'This season' },
  { id: 'worst', label: 'Worst week this year' },
];

const NEED_ICON: Record<NeedKey, string> = {
  Water: '💧',
  'Drinking water': '🚰',
  Food: '🥕',
  Shelter: '🏠',
  Sanitation: '🧻',
  Electricity: '⚡',
  Transportation: '🚲',
  'Cooking fuel': '🍳',
  'Heated shelter': '🔥',
  'Cooled shelter': '❄',
  'Est. Required Labor': '⏱',
};

/** The Human Needs Checklist, full screen (N). */
export function Checklist() {
  const open = useGame((s) => s.checklistOpen);
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const [mode, setMode] = useState<ChecklistMode>('average');
  const bal = useMemo(() => designBalance(game, catalog), [game.instances, game.site, catalog]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  const st = useGame.getState();
  const v = checklistView(game, catalog, mode, bal);
  const counts = designCounts(game);
  const week = resourceWeek(game, catalog);
  const inputs = Object.values(bal.resources).filter((r) => r.consumed.value > 0);
  const outputs = Object.values(bal.resources).filter((r) => r.produced.value > 0);
  const noHistory = mode !== 'average' && game.ledgers.length === 0;
  return (
    <div className="sheet" role="dialog" aria-label="Human needs checklist" data-testid="checklist">
      <header className="sheet-head">
        <h2>Human needs checklist</h2>
        <div className="seg" role="radiogroup" aria-label="View">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={mode === m.id}
              className={`seg-btn ${mode === m.id ? 'on' : ''}`}
              onClick={() => setMode(m.id)}
              data-testid={`mode-${m.id}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <button
          className="btn ghost"
          onClick={() => st.setChecklist(false)}
          aria-label="Close checklist"
          data-testid="checklist-close"
        >
          ✕
        </button>
      </header>
      <div className="sheet-summary">
        <ScoreRing score={v.overall} size={72} label="Overall off-grid score" />
        <p data-testid="checklist-summary">
          {noHistory ? 'Run the clock to see how the design does day by day. Showing the average year. ' : ''}
          {v.summary}
        </p>
      </div>
      <table className="checklist" data-testid="checklist-table">
        <thead>
          <tr>
            <th>Human need</th>
            <th>Provided by your design (per week)</th>
            <th>
              Total needed for {v.humans} human{v.humans === 1 ? '' : 's'} (per week)
            </th>
            <th>% covered</th>
            <th>Covered?</th>
            <th>Last 52 weeks</th>
          </tr>
        </thead>
        <tbody>
          {v.rows.map((r) => (
            <tr key={r.need} data-testid={`row-${r.need}`}>
              <td>
                <span aria-hidden="true" className="need-icon">
                  {NEED_ICON[r.need]}
                </span>{' '}
                {r.need}
              </td>
              <td>
                <WhyNum
                  value={r.provided}
                  title={`${r.need}: provided`}
                  unit={r.unit}
                  testId={`provided-${r.need}`}
                />
              </td>
              <td>
                <WhyNum
                  value={r.needed}
                  title={`${r.need}: needed`}
                  unit={r.unit}
                  testId={`needed-${r.need}`}
                />
              </td>
              <td>
                <WhyNum
                  value={r.pct}
                  title={`${r.need}: % covered`}
                  format={fmtPct}
                  testId={`pct-${r.need}`}
                />
              </td>
              <td className={`covered ${r.covered === '✓' ? 'yes' : r.covered === '✗' ? 'no' : ''}`}>
                {r.covered === '✓' ? '✓ Covered' : r.covered === '✗' ? '✗ Short' : 'n/a'}
              </td>
              <td>
                <svg
                  width="120"
                  height="22"
                  className="spark"
                  aria-label={`${r.need}: last ${r.sparkline.length} weeks`}
                >
                  <line x1="0" x2="120" y1="1" y2="1" className="spark-full" />
                  <polyline points={sparkPoints(r.sparkline, 120, 20)} className="spark-line" />
                </svg>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        Provided = every output feeding the row, converted to the row's unit (e.g. eggs × 70 kcal). Needed =
        every input feeding it, so animals, gardens, and shelters add to the need alongside people. Click any
        number for where it came from.
      </p>
      <section className="strip" aria-label="Design summary" data-testid="design-strip">
        <div>
          <h3>Inputs ({inputs.length})</h3>
          <ul>
            {inputs.map((r) => (
              <li key={r.resource}>
                <button className="link" onClick={() => st.setHighlight(r.resource)}>
                  {r.resource}
                </button>{' '}
                <span className="muted">
                  {fmtNum(r.consumed.value)} {r.unit}/wk
                  {week.find((w) => w.resource === r.resource)?.short ? ' · short' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Systems ({Object.values(counts).reduce((a, b) => a + b, 0)})</h3>
          <ul>
            {Object.entries(counts).map(([id, n]) => {
              const s = getSystem(catalog, id);
              return (
                <li key={id}>
                  <button className="link sys-link" onClick={() => st.openCard(id)}>
                    <SystemIcon system={s} size={18} /> {s.name}
                  </button>{' '}
                  <span className="muted">×{n}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <h3>Outputs ({outputs.length})</h3>
          <ul>
            {outputs.map((r) => (
              <li key={r.resource}>
                <button className="link" onClick={() => st.setHighlight(r.resource)}>
                  {r.resource}
                </button>{' '}
                <span className="muted">
                  {fmtNum(r.produced.value)} {r.unit}/wk
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
