import { Fragment, useMemo, useState } from 'react';
import {
  checklistView,
  designBalance,
  designCounts,
  getSystem,
  resourceWeek,
  type BlockedSystem,
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
  { id: 'current', label: 'Current operations' },
  { id: 'completed', label: 'Completed design forecast' },
  { id: 'average', label: 'Planned design forecast' },
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

/** The resource a checklist row opens (G13): mostly the same name; heat and cooling are the rows' services. */
const NEED_RESOURCE: Record<NeedKey, string> = {
  Water: 'Water',
  'Drinking water': 'Drinking water',
  Food: 'Food',
  Shelter: 'Shelter',
  Sanitation: 'Sanitation',
  Electricity: 'Electricity',
  Transportation: 'Transportation',
  'Cooking fuel': 'Cooking fuel',
  'Heated shelter': 'Heat',
  'Cooled shelter': 'Cooling',
  'Est. Required Labor': 'Labor',
};

/** The Human Needs Checklist, full screen (N). */
export function Checklist() {
  const open = useGame((s) => s.checklistOpen);
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const [mode, setMode] = useState<ChecklistMode>('current');
  const bal = useMemo(() => designBalance(game, catalog, mode === 'average' ? 'planned' : 'completed'), [game.instances, game.site, catalog, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  const st = useGame.getState();
  const v = checklistView(game, catalog, mode, bal);
  const forecast = mode === 'average' || mode === 'completed';
  const counts = designCounts(game, { activeOnly: mode !== 'average' });
  const week = resourceWeek(game, catalog);
  const inputs = Object.values(bal.resources).filter((r) => r.consumed.value > 0);
  const outputs = Object.values(bal.resources).filter((r) => r.produced.value > 0);
  const noHistory = !forecast && game.ledgers.length === 0;
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
        <ScoreRing score={v.overall} size={72} label={forecast ? "Forecast need coverage" : "Measured need coverage"} />
        <div className="potential-score" data-testid="potential-score">
          <span className="muted">If every input were met</span>
          <WhyNum value={v.potentialOverall} title="Potential score (every input met)" format={fmtPct} />
          <span className="muted">Self-reliance</span>
          <WhyNum value={v.selfReliance} title="Self-reliance" format={fmtPct} testId="self-reliance" />
        </div>
        <p data-testid="checklist-summary">
          {noHistory ? 'No measured history. ' : ''}
          {v.summary}
        </p>
      </div>
      <table className="checklist" data-testid="checklist-table">
          <caption>{forecast ? 'Average-year forecast; flows as weekly equivalents, capacities as labeled.' : v.range ? `Measured days ${v.range.from}–${v.range.to}; ${mode === 'worst' ? 'each need’s worst week in this history' : 'flows as weekly equivalents'}, capacities as labeled.` : 'No measured days yet.'}</caption>
        <thead>
          <tr>
            <th>Human need</th>
            <th>{forecast ? 'Forecast supply' : 'Measured production'} (weekly equivalent; capacities as labeled)</th>
            <th>Ceiling if supplied</th>
            <th>
              Needed for {v.humans} human{v.humans === 1 ? '' : 's'} (weekly flows / capacities)
            </th>
            <th>% covered</th>
            <th>Covered?</th>
            <th>Made at home</th>
            <th>Last 52 weeks</th>
          </tr>
        </thead>
        <tbody>
          {v.rows.map((r) => (
            <Fragment key={r.need}>
            <tr data-testid={`row-${r.need}`}>
              <td>
                <span aria-hidden="true" className="need-icon">
                  {NEED_ICON[r.need]}
                </span>{' '}
                <button className="link" onClick={() => st.openResource(NEED_RESOURCE[r.need])} title={`Where ${NEED_RESOURCE[r.need]} comes from`}>
                  {r.need}
                </button>
              </td>
              <td>
                <WhyNum
                  value={r.provided}
                  title={`${r.need}: ${forecast ? 'forecast' : 'measured production'}`}
                  unit={r.need === 'Shelter' ? `${r.unit} capacity` : r.unit}
                  testId={`provided-${r.need}`}
                />
              </td>
              <td className="potential">
                <WhyNum
                  value={r.potential}
                  title={`${r.need}: potential (every input met)`}
                  unit={r.need === 'Shelter' ? `${r.unit} capacity` : r.unit}
                  testId={`potential-${r.need}`}
                />
              </td>
              <td>
                <WhyNum
                  value={r.needed}
                  title={`${r.need}: needed`}
                  unit={r.need === 'Shelter' ? `${r.unit} capacity` : r.unit}
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
                {r.covered === 'n/a' ? (
                  <span className="muted">—</span>
                ) : (
                  <WhyNum value={r.selfReliance} title={`${r.need}: made at home`} format={fmtPct} />
                )}
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
            {r.blocked.length > 0 && (
              <tr className="blocked-row">
                <td colSpan={8}>
                  <BlockedList need={r.need} blocked={r.blocked} />
                </td>
              </tr>
            )}
            </Fragment>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        {forecast
          ? 'Annual forecast assumes maturity and steady site conditions; it excludes stockpiles, gathering, market orders and the time needed to build. Planned design includes unfinished systems; completed design excludes them.'
          : 'Measured supply and coverage come from daily ledgers, including gathering, purchases and actual construction dates. Coverage also includes supplies drawn from stock; the ceiling includes at least that measured delivery. No future production is credited.'}
        {' '}Capacities such as shelter are not weekly production. Click a number for its measurement window and explanation.
      </p>
      <section className="strip" aria-label="Design forecast summary" data-testid="design-strip">
        <p className="muted">{mode === 'average' ? 'Planned' : 'Completed'} design forecast at maturity; separate from measured history above.</p>
        <div>
          <h3>Inputs ({inputs.length})</h3>
          <ul>
            {inputs.map((r) => (
              <li key={r.resource}>
                <button className="link" onClick={() => st.setHighlight(r.resource)}>
                  {r.resource}
                </button>{' '}
                <span className="muted">
                  {fmtNum(r.consumed.value)} {r.unit}{catalog.resources.find((x) => x.name === r.resource)?.class === 'Capacity' ? ' capacity' : '/wk'}
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
                  <span className="muted">×{n}{mode === 'average' && game.instances.some((i) => i.systemId === id && i.status === 'building') ? ' · includes construction' : ' · completed'}</span>
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
                  {fmtNum(r.produced.value)} {r.unit}{catalog.resources.find((x) => x.name === r.resource)?.class === 'Capacity' ? ' capacity' : '/wk'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

/** "N systems blocked", expanding to each one, what it is missing, and a way to find it. */
function BlockedList({ need, blocked }: { need: string; blocked: BlockedSystem[] }) {
  const [open, setOpen] = useState(false);
  const st = useGame.getState();
  const n = blocked.length;
  return (
    <div className="blocked" data-testid={`blocked-${need}`}>
      <button className="link" aria-expanded={open} onClick={() => setOpen(!open)} data-testid={`blocked-toggle-${need}`}>
        {open ? '▾' : '▸'} {n} system{n === 1 ? '' : 's'} {n === 1 ? 'is' : 'are'} held back
      </button>
      {open && (
        <ul className="blocked-list">
          {blocked.map((b) => (
            <li key={b.systemId}>
              <span className={`badge-dot ${b.satisfaction <= 1e-9 ? 'blocked' : 'partial'}`} aria-hidden="true" />
              <button className="link" onClick={() => st.openCard(b.systemId)}>
                {b.name}
              </button>
              {b.count > 1 ? ` ×${fmtNum(b.count)}` : ''}: <span className="muted">{b.status}</span>
              {b.limitedBy && (
                <button className="btn small" onClick={() => st.findSource(b.limitedBy!)} data-testid={`find-${b.limitedBy}`}>
                  Find a source of {b.limitedBy}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
