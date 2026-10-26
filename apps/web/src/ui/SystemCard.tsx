import { ShelterOccupancy } from './ShelterOccupancy.tsx';
import { WinterWater } from './WinterWater.tsx';
import { ToolGathering } from './ToolGathering.tsx';
import { SoilFertility } from './SoilFertility.tsx';
import { HouseholdRole } from './HouseholdRole.tsx';
import { useEffect, useRef, useState } from 'react';
import {
  maintenanceView,
  costFor,
  getSystem,
  instanceStatuses,
  setupHoursFor,
  supplyChain,
  systemCard,
  type ChainNode,
} from '@homestead/engine';
import { fmtMoney, fmtNum, fmtPct } from '../lib/format.ts';
import { useGame } from '../store/game.ts';
import { ResourceLink } from './ResourcePage.tsx';
import { SystemIcon } from './SystemIcon.tsx';
import { ProjectPreview } from './ProjectPreview.tsx';
import { InstanceMechanics } from './InstanceMechanics.tsx';
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
/** Buy or DIY: remembered across cards for the session (LL-19). */
let lastMode: 'buy' | 'diy' = 'buy';

export function SystemCard() {
  const cardId = useGame((s) => s.cardSystemId);
  const instanceId = useGame((s) => s.cardInstanceId);
  const catalog = useGame((s) => s.catalog);
  const game = useGame((s) => s.game);
  const id = (instanceId ? game.instances.find((i) => i.id === instanceId)?.systemId : null) ?? cardId;
  const [mode, setModeState] = useState<'buy' | 'diy'>(lastMode);
  // LL-19: the next card opens on the mode the player last chose.
  const setMode = (m: 'buy' | 'diy') => {
    lastMode = m;
    setModeState(m);
  };
  const [details, setDetails] = useState(false);
  const [chain, setChain] = useState(false);
  const canBack = useGame((s) => s.navBack.length > 0);
  const cardRef = useRef<HTMLElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Keyboard players land on the card's main action.
  useEffect(() => {
    if (!id) return;
    if (cardRef.current) cardRef.current.scrollTop = 0;
    (addRef.current ?? closeRef.current)?.focus();
  }, [id, instanceId]);
  if (!id) return null;
  const st = useGame.getState();
  const sys = getSystem(catalog, id);
  const v = systemCard(game, catalog, id, instanceId ?? undefined);
  const inst = v.instance;
  const maintenance = instanceId ? maintenanceView(game, catalog, instanceId) : null;
  const close = () => st.openCard(null);
  const hasDiy = sys.costDiy !== undefined;
  const chosen = hasDiy ? mode : 'buy';
  return (
    <section ref={cardRef} className="card" role="dialog" aria-label={`${sys.name} card`} data-testid="system-card">
      <header className="card-head">
        {canBack && (
          <button className="btn ghost" onClick={() => st.navigateBack()} aria-label="Back" data-testid="nav-back">
            ←
          </button>
        )}
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
      {maintenance && instanceId && (
        <div className="inst-box" data-testid="maintenance">
          <p>
            Condition: <WhyNum value={maintenance.condition} title="Condition" format={fmtPct} /> · Output:{' '}
            <WhyNum value={maintenance.output} title="Condition output factor" format={fmtPct} />
          </p>
          <p>
            Repair: <WhyNum value={maintenance.parts} title="Repair parts" format={fmtMoney} /> and{' '}
            <WhyNum value={maintenance.hours} title="Repair labor" /> h. Operation stops until work finishes.
          </p>
          <button
            className="btn small"
            disabled={!maintenance.canRepair}
            onClick={() =>
              useGame.getState().phase9Action({ kind: 'service', id: instanceId, replace: false })
            }
          >
            Repair
          </button>
          <button
            className="btn small"
            disabled={!maintenance.canReplace}
            onClick={() =>
              useGame.getState().phase9Action({ kind: 'service', id: instanceId, replace: true })
            }
          >
            Replace for {fmtMoney(maintenance.replacement.value)}
          </button>
        </div>
      )}

      {instanceId && (
        <>
          <InstanceMechanics key={instanceId} id={instanceId} />
          <ShelterOccupancy key={`home-${instanceId}`} id={instanceId} />
          <WinterWater key={`winter-${instanceId}`} id={instanceId} />
          <ToolGathering key={`tool-${instanceId}`} id={instanceId} />
          <SoilFertility key={`soil-${instanceId}`} id={instanceId} />
          <HouseholdRole key={`role-${instanceId}`} id={instanceId} />
        </>
      )}
      {inst ? (
        <div className="inst-box" data-testid="instance-box">
          <div>
            <span className="muted">
              {inst.status === 'building'
                ? maintenance?.servicing
                  ? 'Servicing'
                  : 'Building'
                : 'Running at'}{' '}
            </span>
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
          <ProjectPreview systemId={sys.id} mode={chosen} />
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
                    {c.name} ({c.id}), {c.distanceText}
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

      <p className="muted small" data-testid="card-basis">{v.basis}</p>
      {inst?.status === 'active' && v.hasMeasurement && <StatusLine systemId={id} instanceId={instanceId} />}

      <h3>Inputs</h3>
      <ul className="io-list" data-testid="card-inputs">
        {v.inputs.map((i) => (
          <li key={i.view.flow.id}>
            <div className="io-head">
              <span>
                <ResourceLink name={i.view.resource} />{' '}
                <span className={`role role-${i.role}`} title={ROLE_HELP[i.role]}>
                  {ROLE_LABEL[i.role]}
                </span>
              </span>
              {i.measured ? (
                <span className="res-num measured-number">
                  <WhyNum value={i.measured.used} title={`${i.view.resource} used yesterday`} /> /{' '}
                  <WhyNum value={i.measured.requested} title={`${i.view.resource} requested yesterday`} /> {i.view.unit}{' '}
                  {i.role === 'capacity' ? 'capacity used / requested yesterday' : 'used / requested yesterday'}
                  <span className="muted small card-estimate">Catalog estimate: <WhyNum value={i.view.qty} title={`${i.view.resource} catalog estimate`} /> {i.view.unit} {i.view.periodLabel}</span>
                </span>
              ) : i.stock ? (
                <span className="res-num" data-testid={`card-stock-${i.view.resource}`}>
                  <WhyNum value={i.stock.onHand} title={`${i.view.resource} on hand`} /> {i.view.unit} on hand ·{' '}
                  {i.stock.days ? (
                    <>
                      lasts about{' '}
                      <WhyNum
                        value={i.stock.days}
                        title={`${i.view.resource} lasts`}
                        format={(n) => (n > 365 ? 'over a year' : `${Math.floor(n)} days`)}
                      />
                    </>
                  ) : (
                    'no use yet'
                  )}{' '}
                  · needs <WhyNum value={i.needed} title={`${i.view.resource} needed`} /> {i.view.unit}{' '}
                  {i.view.periodLabel}
                </span>
              ) : (
              <span className="res-num">
                <WhyNum value={i.supplied} title={`${i.view.resource} supplied`} /> /{' '}
                <WhyNum value={i.needed} title={`${i.view.resource} needed`} /> {i.view.unit}{' '}
                  {i.view.flow.period === 'One-time'
                    ? game.instances.find((x) => x.id === inst?.id)?.materialsDrawn
                      ? 'supplied during construction'
                      : 'to build'
                    : `needed ${i.view.periodLabel}`}
              </span>
              )}
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

      <div className="chain-toggle">
        <button className="btn small" onClick={() => setChain(!chain)} aria-expanded={chain} data-testid="show-chain">
          {chain ? 'Hide supply chain' : 'Show supply chain'}
        </button>
      </div>
      {chain && <SupplyChain systemId={id} near={placedAt(game.instances, inst?.id)} />}

      <h3>Outputs</h3>
      <ul className="io-list" data-testid="card-outputs">
        {v.outputs.map((o) => (
          <li key={o.view.flow.id}>
            <div className="io-head">
              <span>
                <ResourceLink name={o.view.resource} />
              </span>
              <span className={`res-num${o.nominal ? ' measured-number' : ''}`}>
                <WhyNum value={o.produced} title={`${o.view.resource} produced`} unit={o.view.unit} />{' '}
                {o.window}
                {o.nominal && <span className="muted small card-estimate">Catalog estimate: <WhyNum value={o.nominal} title={`${o.view.resource} catalog estimate`} /> {o.view.unit} {o.view.periodLabel}</span>}
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

/** "Blocked: no Electricity", with a way to the missing input (G11/G13). */
function StatusLine({ systemId, instanceId }: { systemId: string; instanceId: string | null }) {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  if (!game.instances.some((i) => i.systemId === systemId)) return null;
  const status = instanceId ? instanceStatuses(game, catalog).get(instanceId) : undefined;
  if (!status) return null;
  return (
    <p className={`status-line ${status.level}`} data-testid="card-status">
      <span className={`badge-dot ${status.level}`} aria-hidden="true" />{' '}
      {status.text[0]!.toUpperCase() + status.text.slice(1)}
      {status.limitedBy && status.limitedBy !== 'Shelter' && (
        <>
          {' '}
          · <ResourceLink name={status.limitedBy} className="find" />
        </>
      )}
    </p>
  );
}

/** Pick the cheapest producer for every unmet input down the chain (what "Plan this branch" builds). */
function branchSystems(node: ChainNode): string[] {
  if (node.satisfied || !node.options.length) return [];
  const best = node.options.find((o) => o.inDesign) ?? node.options[0]!;
  const below = best.inputs.flatMap(branchSystems);
  return best.inDesign ? below : [best.systemId, ...below];
}

/** Inputs → producers → their inputs, three levels deep; satisfied branches collapse green (G13). */
function SupplyChain({ systemId, near }: { systemId: string; near?: { x: number; y: number } }) {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const tree = supplyChain(game, catalog, systemId, 3);
  const st = useGame.getState();
  if (!tree.length) return <p className="muted small">It needs nothing but labor.</p>;
  return (
    <div className="chain" data-testid="supply-chain">
      <ChainLevel nodes={tree} depth={0} />
      {tree.some((n) => !n.satisfied) && (
        <button
          className="btn small"
          onClick={() => {
            const ids = tree.flatMap(branchSystems);
            if (ids.length) st.planAdd(ids, near);
            else
              st.toast(
                'Nothing to plan: the missing inputs have no producer in the catalog. Try the market.',
              );
          }}
          data-testid="plan-branch"
        >
          Plan this branch
        </button>
      )}
    </div>
  );
}

function ChainLevel({ nodes, depth }: { nodes: ChainNode[]; depth: number }) {
  const st = useGame.getState();
  return (
    <ul className={`chain-level d${depth}`}>
      {nodes.map((n) => (
        <li key={n.resource} className={n.satisfied ? 'ok' : 'short'}>
          <details open={!n.satisfied}>
            <summary>
              <span aria-hidden="true">{n.satisfied ? '✓' : '✗'}</span> <ResourceLink name={n.resource} />{' '}
              <span className="muted">
                {n.satisfied ? 'covered' : `${fmtPct(n.met)} covered`}
                {n.buy !== null ? ` · market $${n.buy < 0.1 ? n.buy.toFixed(4) : n.buy.toFixed(2)}` : ''}
              </span>
            </summary>
            {n.options.length > 0 && (
              <ul className="chain-options">
                {n.options.map((o) => (
                  <li key={o.systemId}>
                    <button className="link" onClick={() => st.openCard(o.systemId)}>
                      {o.name}
                    </button>{' '}
                    <span className="muted">
                      {o.inDesign ? 'in your design' : `${fmtMoney(o.cost)} ${o.mode === 'diy' ? 'DIY' : 'to buy'}`}
                    </span>
                    {o.inputs.length > 0 && <ChainLevel nodes={o.inputs} depth={depth + 1} />}
                  </li>
                ))}
              </ul>
            )}
          </details>
        </li>
      ))}
    </ul>
  );
}

function placedAt(instances: readonly { id: string; x: number; y: number }[], id: string | undefined) {
  const i = id ? instances.find((x) => x.id === id) : undefined;
  return i ? { x: i.x, y: i.y } : undefined;
}
