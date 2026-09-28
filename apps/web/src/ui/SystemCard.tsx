import { costFor, setupHoursFor, systemFlows } from '@homestead/engine';
import { fmtMoney, fmtNum } from '../lib/format.ts';
import { useGame } from '../store/game.ts';
import { SystemIcon } from './SystemIcon.tsx';

/** The System Card: what a system is, what it costs, and what it takes and makes. */
export function SystemCard() {
  const id = useGame((s) => s.cardSystemId);
  const catalog = useGame((s) => s.catalog);
  const game = useGame((s) => s.game);
  const close = () => useGame.getState().openCard(null);
  const start = useGame((s) => s.startPlacing);
  if (!id) return null;
  const v = systemFlows(catalog, id, game.site.assumptions);
  const sys = v.system;
  const place = (mode: 'buy' | 'diy') => {
    start(sys.id, mode);
    close();
  };
  return (
    <section className="card" role="dialog" aria-label={`${sys.name} card`} data-testid="system-card">
      <header className="card-head">
        <SystemIcon system={sys} size={52} />
        <div>
          <h2>{sys.name}</h2>
          <div className="pills">
            {sys.categories.map((c) => (
              <span key={c} className="pill">
                {c}
              </span>
            ))}
          </div>
        </div>
        <button className="btn ghost close" onClick={close} aria-label="Close card">
          ✕
        </button>
      </header>
      <p className="card-desc">{sys.description}</p>
      <div className="add-choice" role="group" aria-label="Add">
        <button className="btn add" onClick={() => place('buy')} data-testid="add-buy">
          <span className="add-title">Buy</span>
          <span>{fmtMoney(costFor(catalog, sys.id, 'buy'))}</span>
          <span className="add-sub">{fmtNum(setupHoursFor(catalog, sys.id, 'buy'))} h setup</span>
        </button>
        <button
          className="btn add"
          onClick={() => place('diy')}
          disabled={sys.costDiy === undefined}
          data-testid="add-diy"
          title={sys.costDiy === undefined ? 'No build-it-yourself option' : undefined}
        >
          <span className="add-title">Build it yourself</span>
          <span>{sys.costDiy === undefined ? '—' : fmtMoney(costFor(catalog, sys.id, 'diy'))}</span>
          <span className="add-sub">
            {sys.costDiy === undefined
              ? 'Not offered'
              : `${fmtNum(setupHoursFor(catalog, sys.id, 'diy'))} h setup`}
          </span>
        </button>
      </div>
      <div className="card-cols">
        <div>
          <h3>Inputs</h3>
          <ul className="flow-list">
            {v.inputs.map((f) => (
              <li key={f.flow.id} title={f.qty.explain.formula}>
                <span>{f.resource}</span>
                <span className="res-num">
                  {fmtNum(f.qty.value)} {f.unit} {f.periodLabel}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Outputs</h3>
          <ul className="flow-list">
            {v.outputs.map((f) => (
              <li key={f.flow.id} title={f.qty.explain.formula}>
                <span>{f.resource}</span>
                <span className="res-num">
                  {fmtNum(f.qty.value)} {f.unit} {f.periodLabel}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="card-labor">
        Labor: {fmtNum(sys.setupLaborHrs)} h to set up, {fmtNum(sys.weeklyUpkeepHrs)} h a week to keep up.
      </p>
    </section>
  );
}
