import { useEffect, useRef, useState } from 'react';
import { costFor, getSystem, setupHoursFor, systemCard } from '@homestead/engine';
import { fmtMoney, fmtNum, fmtPct } from '../lib/format.ts';
import { useGame } from '../store/game.ts';
import { SystemIcon } from './SystemIcon.tsx';
import { WhyNum } from './Why.tsx';

const ROLE_LABEL = {
  required: 'required',
  capacity: 'capacity',
  boost: 'boost',
  ambient: 'site',
  need: 'need',
} as const;
const ROLE_HELP = {
  required: 'Output scales with the least-supplied required input.',
  capacity: 'Occupied, not used up.',
  boost: 'Raises yield when supplied; not essential.',
  ambient: 'Supplied by the site (sun, rain, wind, stream).',
  need: 'Consumed and tracked; shortfalls hurt health but never switch this off.',
} as const;
const TIER_LABEL = ['people first', 'animals', 'everything else'];

/** The System Card: what a system is, what it costs, what it takes and makes, and why. */
export function SystemCard() {
  const id = useGame((s) => s.cardSystemId);
  const instanceId = useGame((s) => s.cardInstanceId);
  const catalog = useGame((s) => s.catalog);
  const game = useGame((s) => s.game);
  const [mode, setMode] = useState<'buy' | 'diy'>('buy');
  const [details, setDetails] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Keyboard players land on the card's main action.
  useEffect(() => {
    if (!id) return;
    (addRef.current ?? closeRef.current)?.focus();
  }, [id, instanceId]);
  if (!id) return null;
  const st = useGame.getState();
  const sys = getSystem(catalog, id);
  const v = systemCard(game, catalog, id, instanceId ?? undefined);
  const inst = v.instance;
  const close = () => st.openCard(null);
  const hasDiy = sys.costDiy !== undefined;
  const chosen = hasDiy ? mode : 'buy';
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
        <button ref={closeRef} className="btn ghost close" onClick={close} aria-label="Close card" data-testid="card-close">
          ✕
        </button>
      </header>
      <p className="card-desc">{sys.description}</p>

      {inst ? (
        <div className="inst-box" data-testid="instance-box">
          <div>
            <span className="muted">{inst.status === 'building' ? 'Building' : 'Running at'} </span>
            {inst.status === 'building' ? (
              <WhyNum
                value={inst.setupProgress}
                title="Construction progress"
                format={fmtPct}
                testId="inst-progress"
              />
            ) : (
              <WhyNum
                value={inst.satisfaction}
                title={`${sys.name} satisfaction`}
                format={fmtPct}
                testId="inst-sat"
              />
            )}
            {inst.limitedBy && inst.status === 'active' && (
              <span className="limited" data-testid="inst-limited">
                {' '}
                · limited by <strong>{inst.limitedBy}</strong>
              </span>
            )}
          </div>
          {sys.yearsToFullOutput > 0 && (
            <div>
              <span className="muted">Maturity </span>
              <WhyNum value={inst.maturity} title="Maturity" format={fmtPct} />
            </div>
          )}
          <div className="prio" role="group" aria-label="Priority">
            <span className="muted">Priority: {TIER_LABEL[inst.priority] ?? `tier ${inst.priority}`}</span>
            <button
              className="btn ghost"
              disabled={inst.priority <= 0}
              onClick={() => st.setInstancePriority(inst.id, inst.priority - 1)}
              data-testid="prio-up"
            >
              Serve sooner
            </button>
            <button
              className="btn ghost"
              disabled={inst.priority >= 2}
              onClick={() => st.setInstancePriority(inst.id, inst.priority + 1)}
            >
              Serve later
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="add-choice" role="radiogroup" aria-label="How to add it">
            <button
              role="radio"
              aria-checked={chosen === 'buy'}
              className={`btn add ${chosen === 'buy' ? 'on' : ''}`}
              onClick={() => setMode('buy')}
              data-testid="choose-buy"
            >
              <span className="add-title">Buy</span>
              <span>{fmtMoney(costFor(catalog, sys.id, 'buy'))}</span>
              <span className="add-sub">{fmtNum(setupHoursFor(catalog, sys.id, 'buy'))} h setup</span>
            </button>
            <button
              role="radio"
              aria-checked={chosen === 'diy'}
              className={`btn add ${chosen === 'diy' ? 'on' : ''}`}
              onClick={() => setMode('diy')}
              disabled={!hasDiy}
              data-testid="choose-diy"
              title={hasDiy ? undefined : 'No build-it-yourself option'}
            >
              <span className="add-title">Build it yourself</span>
              <span>{hasDiy ? fmtMoney(costFor(catalog, sys.id, 'diy')) : '—'}</span>
              <span className="add-sub">
                {hasDiy ? `${fmtNum(setupHoursFor(catalog, sys.id, 'diy'))} h setup` : 'Not offered'}
              </span>
            </button>
          </div>
          <div className="add-row">
            <button
              ref={addRef}
              className="btn primary"
              onClick={() => {
                st.startPlacing(sys.id, chosen);
                close();
              }}
              data-testid={chosen === 'buy' ? 'add-buy' : 'add-diy'}
            >
              Add {chosen === 'buy' ? '(buy)' : '(build it yourself)'}
            </button>
            <span className="muted">
              {fmtMoney(costFor(catalog, sys.id, chosen))} now,{' '}
              {fmtNum(setupHoursFor(catalog, sys.id, chosen))} h of work
            </span>
          </div>
        </>
      )}

      {v.spatial && (v.spatial.notes.length > 0 || v.spatial.links.length > 0) && (
        <div className="where" data-testid="card-where">
          <h3>Where it sits</h3>
          {v.spatial.links.map((l) => (
            <label key={l.resource} className="link-pick">
              {l.resource} from{' '}
              <select
                value={l.linked ? (l.providerId ?? '') : ''}
                onChange={(e) => st.setInstanceLink(inst!.id, l.resource, e.target.value || null)}
                data-testid={`link-${l.resource}`}
              >
                <option value="">
                  Nearest with room
                  {!l.linked && l.providerId
                    ? ` (now ${l.candidates.find((c) => c.id === l.providerId)?.name ?? l.providerId})`
                    : ''}
                </option>
                {l.candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.id}), {Math.round(c.distanceFt)} ft
                  </option>
                ))}
              </select>
              {l.providerId === null && (
                <span className="badge warn">
                  ! None{l.maxDistanceFt !== null ? ` within ${l.maxDistanceFt} ft` : ''}
                </span>
              )}
            </label>
          ))}
          <ul className="where-notes">
            {v.spatial.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      <h3>Inputs</h3>
      <ul className="io-list" data-testid="card-inputs">
        {v.inputs.map((i) => (
          <li key={i.view.flow.id}>
            <div className="io-head">
              <span>
                {i.view.resource}{' '}
                <span className={`role role-${i.role}`} title={ROLE_HELP[i.role]}>
                  {ROLE_LABEL[i.role]}
                </span>
              </span>
              <span className="res-num">
                <WhyNum value={i.supplied} title={`${i.view.resource} supplied`} /> /{' '}
                <WhyNum value={i.needed} title={`${i.view.resource} needed`} /> {i.view.unit}{' '}
                {i.view.flow.period === 'One-time' ? 'to build' : `needed ${i.view.periodLabel}`}
              </span>
            </div>
            <div
              className="bar"
              role="meter"
              aria-valuenow={Math.round(i.share.value * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${i.view.resource} supplied`}
            >
              <div
                className={`bar-fill ${i.share.value < 0.999 ? 'short' : ''}`}
                style={{ width: fmtPct(i.share.value) }}
              />
            </div>
          </li>
        ))}
      </ul>

      <h3>Outputs</h3>
      <ul className="io-list" data-testid="card-outputs">
        {v.outputs.map((o) => (
          <li key={o.view.flow.id}>
            <div className="io-head">
              <span>{o.view.resource}</span>
              <span className="res-num">
                <WhyNum value={o.produced} title={`${o.view.resource} produced`} unit={o.view.unit} />{' '}
                {o.view.periodLabel}
              </span>
            </div>
            {o.week && o.week.produced.value > 0 && (
              <div className="went muted">
                Across the design last week: used <WhyNum value={o.week.consumed} title="Used" />, stored{' '}
                <WhyNum value={o.week.stored} title="Stored" />, spilled{' '}
                <WhyNum value={o.week.spilled} title="Spilled" />, spoiled{' '}
                <WhyNum value={o.week.spoiled} title="Spoiled" /> {o.view.unit}
              </div>
            )}
          </li>
        ))}
      </ul>

      <h3>Labor</h3>
      <p className="card-labor">
        {fmtNum(sys.setupLaborHrs)} h to set up ({fmtNum(setupHoursFor(catalog, sys.id, 'buy'))} h if bought),{' '}
        {fmtNum(sys.weeklyUpkeepHrs)} h a week to keep up.
      </p>

      <button
        className="btn ghost details-toggle"
        aria-expanded={details}
        onClick={() => setDetails(!details)}
      >
        {details ? '▾' : '▸'} Details
      </button>
      {details && (
        <div className="details" data-testid="card-details">
          <dl>
            <dt>Lifespan</dt>
            <dd>{fmtNum(sys.lifespanYrs)} years</dd>
            <dt>Footprint</dt>
            <dd>{fmtNum(sys.footprintSqft)} sq ft</dd>
            <dt>Years to full output</dt>
            <dd>{sys.yearsToFullOutput}</dd>
            <dt>Confidence</dt>
            <dd>{sys.confidence}</dd>
            <dt>Source</dt>
            <dd>{sys.source}</dd>
            {sys.notes && (
              <>
                <dt>Notes</dt>
                <dd>{sys.notes}</dd>
              </>
            )}
          </dl>
          <div className="muted">Catalog rows (LandLab_Sim_Systems_v2.xlsx):</div>
          <ul className="rows">
            <li>Systems: {sys.id}</li>
            {[...v.inputs.map((i) => i.view.flow), ...v.outputs.map((o) => o.view.flow)].map((f) => (
              <li key={f.id}>
                Flows: {f.id} · {f.direction === 'in' ? 'input' : 'output'} {f.resource}
                {f.inputRole ? ` · role ${f.inputRole} (${f.provenance.inputRole})` : ''} · timing{' '}
                {f.timing.kind} ({f.provenance.timing})
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
