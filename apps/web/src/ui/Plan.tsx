import { useMemo, useRef, useState } from 'react';
import { SITES } from '@homestead/catalog';
import {
  planningBaseline,
  planningFingerprint,
  transitionForecast,
  weatherRiskPolicy,
  designFromGame,
  flowRecords,
  ledgersCsv,
  monteCarloTable,
  scenarioSummary,
  sensitivity,
  type DesignFile,
  type MonteCarloResult,
  type MonteCarloSpec,
  type ScenarioSummary,
} from '@homestead/engine';
import { histogramBars, progressWidth, tornadoAxis, tornadoBar } from '../lib/charts.ts';
import { download, slug } from '../lib/download.ts';
import { fmtMoney, fmtNum, fmtPct } from '../lib/format.ts';
import { useGame } from '../store/game.ts';
import { MAX_SCENARIOS, MC_PRESETS, usePlan, type McState, type PlanTab, type Scenario } from '../store/plan.ts';
import { WhyNum } from './Why.tsx';

const TABS: { id: PlanTab; label: string }[] = [
  { id: 'scenarios', label: 'Scenarios' },
  { id: 'transition', label: 'Next 90 days' },
  { id: 'montecarlo', label: 'Weather risk' },
  { id: 'sensitivity', label: 'Sensitivity' },
  { id: 'export', label: 'Export' },
];

/** Planning tools: compare scenarios, run weather risk (Monte Carlo), sensitivity, and exports. */
export function Plan() {
  const open = usePlan((s) => s.open);
  const tab = usePlan((s) => s.tab);
  if (!open) return null;
  const p = usePlan.getState();
  return (
    <section className="panel wide plan" role="dialog" aria-label="Plan" data-testid="plan">
      <header className="panel-head">
        <h2>Plan</h2>
        <div className="tabs" role="tablist" aria-label="Planning tools">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`tab ${tab === t.id ? 'on' : ''}`}
              onClick={() => p.setTab(t.id)}
              data-testid={`plan-tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button className="btn ghost" onClick={() => p.setOpen(false)} aria-label="Close plan">
          ✕
        </button>
      </header>
      <PlanningBasis />
      {tab === 'transition' && <TransitionTab />}
      {tab === 'scenarios' && <Scenarios />}
      {tab === 'montecarlo' && <CurrentMonteCarlo />}
      {tab === 'sensitivity' && <SensitivityTab />}
      {tab === 'export' && <ExportTab />}
    </section>
  );
}

function PlanningBasis() {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const v = useMemo(() => planningBaseline(game, catalog), [game, catalog]);
  return <p className="muted small" data-testid="planning-basis">Annual baseline: all placed systems, completed and mature, including construction; same site, layout, links and spatial modifiers in Scenarios and Sensitivity. Current layout score <WhyNum value={v.summary.overall} title="Shared annual planning baseline" format={(n) => `${(n * 100).toFixed(1)}%`} testId="planning-score" />. Unpurchased build-plan ghosts are excluded. Next 90 days uses current reserves, wellbeing, construction and policies.</p>;
}

function TransitionTab() {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const v = useMemo(() => transitionForecast(game, catalog), [game, catalog]);
  return <div data-testid="transition-forecast"><h3>Current save: next {v.days} days</h3>
    <p>Preserves stocks, cash, construction, maturity, work priorities, employment, market orders, auto-gather, tutorial assistance and town rules. Assumes no new player actions. Real-weather projections follow the current seed. This short projection does not prove long-term stability.</p>
    <p>Cash at end <WhyNum value={v.cashEnd} title="Projected cash at end" format={fmtMoney} /> · minimum <WhyNum value={v.minCash} title="Minimum projected cash" format={fmtMoney} />.</p>
    <p>Lowest individual wellbeing {v.minWellbeing ? <WhyNum value={v.minWellbeing} title="Minimum projected wellbeing" /> : 'no residents'} · away at end: {v.awayEnd.join(', ') || 'none'}.</p>
    <p>{v.firstShortage ? `${v.firstShortage.need} first falls below full demand in ${v.firstShortage.days} days.` : 'No essential supply deficit projected during this window.'}</p>
    <ul>{v.completions.map((c) => <li key={c.id}>{c.name} ({c.id}): completes in {c.days} days.</li>)}</ul>
    <button className="btn" onClick={() => useGame.getState().setPanel('work')}>Change schedule and recovery in Work</button>
  </div>;
}

const finePct = (n: number) => `${(n * 100).toFixed(4)}%`;
const points = (n: number) => `${n > 0 ? '+' : ''}${n !== 0 && Math.abs(n) < 0.00005 ? n.toExponential(2) : n.toFixed(4)} pp`;

// --- Scenarios ------------------------------------------------------------------

function Scenarios() {
  const scenarios = usePlan((s) => s.scenarios);
  const mc = usePlan((s) => s.mc);
  const catalog = useGame((s) => s.catalog);
  const p = usePlan.getState();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const summaries = useMemo(
    () =>
      scenarios.map((sc) => {
        try {
          return scenarioSummary(catalog, sc.design, sc.siteId);
        } catch (e) {
          return e instanceof Error ? e.message : String(e);
        }
      }),
    [scenarios, catalog],
  );
  const add = (r: { ok: boolean; reason?: string }) => setMsg(r.ok ? null : (r.reason ?? null));
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const d = JSON.parse(await f.text()) as DesignFile;
      if (d.schema !== 'homestead.design.v1') throw new Error('That is not a design file (homestead.design.v1).');
      add(p.addScenario(d));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };
  const ok = summaries.filter((s): s is ScenarioSummary => typeof s !== 'string');
  return (
    <div data-testid="scenarios">
      <p className="muted">
        Pin up to {MAX_SCENARIOS} designs and compare them side by side. The average year is balance mode (the
        steady-state supply model); a bad week is the 10th percentile of each run’s worst week in real weather, from Weather risk. Purchase and setup figures are replacement requirements for the entire design, not cash remaining in your save.
      </p>
      <div className="row-actions">
        <button
          className="btn"
          onClick={() => add(p.duplicateAsScenario())}
          disabled={scenarios.length >= MAX_SCENARIOS}
          data-testid="duplicate-scenario"
        >
          Duplicate as scenario
        </button>
        <button className="btn ghost" onClick={() => file.current?.click()} disabled={scenarios.length >= MAX_SCENARIOS}>
          Add a design file…
        </button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => void onFile(e.target.files?.[0])}
          data-testid="scenario-file"
        />
      </div>
      {msg && (
        <p className="warn-text" role="alert">
          {msg}
        </p>
      )}
      {scenarios.length === 0 && <p className="empty">No scenarios yet. Duplicate the current layout to start.</p>}
      {scenarios.length > 0 && (
        <div className="compare-wrap">
          <table className="compare" data-testid="compare">
          <caption>Planned design: average-year weekly flows and capacities; weather risk uses each run’s worst week.</caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Measure</span>
                </th>
                {scenarios.map((sc, i) => (
                  <ScenarioHead key={sc.id} sc={sc} mc={mc[sc.id]} error={typeof summaries[i] === 'string' ? (summaries[i] as string) : null} />
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Overall score</th>
                {summaries.map((s, i) => (
                  <td key={i}>
                    {typeof s !== 'string' && (
                      <>
                        <WhyNum value={s.overall} title={`${s.name}: overall score`} format={fmtPct} />{' '}
                        <span className="muted">avg year</span>
                        <McCell mc={mc[scenarios[i]!.id]} pick={(r) => r.p10Score} label="1-in-10 year" />
                      </>
                    )}
                  </td>
                ))}
              </tr>
              {ok[0]?.checklist.map((row, ri) => (
                <tr key={row.need}>
                  <th scope="row">{row.need}</th>
                  {summaries.map((s, i) => {
                    if (typeof s === 'string') return <td key={i} />;
                    const r = s.checklist[ri]!;
                    if (r.covered === 'n/a') return <td key={i} className="muted">not needed</td>;
                    return (
                      <td key={i} data-testid={`cmp-${i}-${row.need}`}>
                        <WhyNum value={r.pct} title={`${s.name}: ${r.need}`} format={fmtPct} />{' '}
                        <span className="muted">avg year</span>
                        <McCell
                          mc={mc[scenarios[i]!.id]}
                          pick={(res) => res.rows.find((x) => x.need === r.need)?.p10 ?? null}
                          label="bad week"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
              <MetricRow label="Purchase cost" summaries={summaries} get={(s) => s.cost.buy} format={fmtMoney} />
              <MetricRow label="Cheapest build" summaries={summaries} get={(s) => s.cost.cheapest} format={fmtMoney} />
              <MetricRow label="Setup labor (full catalog hours)" summaries={summaries} get={(s) => s.labor.setup} unit="h" />
              <MetricRow label="Labor needed (h/week)" summaries={summaries} get={(s) => s.labor.required} />
              <MetricRow label="Labor available (h/week)" summaries={summaries} get={(s) => s.labor.available} />
              <MetricRow label="Land used" summaries={summaries} get={(s) => s.land.used} unit="sq ft" />
              <MetricRow label="Days of stored water" summaries={summaries} get={(s) => s.autonomy.water} />
              <MetricRow label="Days of battery" summaries={summaries} get={(s) => s.autonomy.battery} />
              <MetricRow label="Cash per year" summaries={summaries} get={(s) => s.cashPerYear} format={fmtMoney} />
              <tr>
                <th scope="row">Chance of a hardship month</th>
                {scenarios.map((sc) => (
                  <td key={sc.id}>
                    <McCell mc={mc[sc.id]} pick={(r) => r.pAnyHardshipMonth} label="" inline />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ScenarioHead({ sc, mc, error }: { sc: Scenario; mc: McState | undefined; error: string | null }) {
  const p = usePlan.getState();
  const run = () =>
    p.runMonteCarlo(sc.id, {
      design: sc.design,
      siteId: sc.siteId,
      years: MC_PRESETS.quick.years,
      seeds: MC_PRESETS.quick.seeds,
      baseSeed: 1,
    });
  return (
    <th scope="col" className="scenario-head">
      <input
        className="name-input"
        value={sc.design.name}
        aria-label="Scenario name"
        onChange={(e) => p.renameScenario(sc.id, e.target.value)}
      />
      <select aria-label="Site" value={sc.siteId} onChange={(e) => p.setScenarioSite(sc.id, e.target.value)}>
        {Object.values(SITES).map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <div className="row-actions">
        {mc?.running ? (
          <button className="btn small" onClick={() => p.cancelMonteCarlo(sc.id)}>
            Cancel ({mc.done}/{mc.total})
          </button>
        ) : (
          <button className="btn small" onClick={run} title={MC_PRESETS.quick.label} data-testid="scenario-mc">
            Weather risk
          </button>
        )}
        <button className="btn ghost small" onClick={() => p.removeScenario(sc.id)} aria-label={`Remove ${sc.design.name}`}>
          Remove
        </button>
      </div>
      {error && <div className="warn-text">{error}</div>}
      {mc?.error && <div className="warn-text">{mc.error}</div>}
    </th>
  );
}

function McCell({
  mc,
  pick,
  label,
  inline,
}: {
  mc: McState | undefined;
  pick: (r: MonteCarloResult) => number | null;
  label: string;
  inline?: boolean;
}) {
  const v = mc?.result ? pick(mc.result) : null;
  const text = mc?.running ? '…' : v === null ? '—' : fmtPct(v);
  return (
    <span className={inline ? '' : 'mc-cell'} title={mc?.result ? `${mc.result.years} years × ${mc.result.seeds} seeds` : 'Run weather risk to see this'}>
      {inline ? text : <>{text} <span className="muted">{label}</span></>}
    </span>
  );
}

function MetricRow({
  label,
  summaries,
  get,
  format = fmtNum,
  unit,
}: {
  label: string;
  summaries: (ScenarioSummary | string)[];
  get: (s: ScenarioSummary) => ScenarioSummary['overall'];
  format?: (n: number) => string;
  unit?: string;
}) {
  return (
    <tr>
      <th scope="row">{label}</th>
      {summaries.map((s, i) => (
        <td key={i}>
          {typeof s !== 'string' && (
            <WhyNum value={get(s)} title={`${s.name}: ${label}`} format={format} {...(unit ? { unit } : {})} />
          )}
        </td>
      ))}
    </tr>
  );
}

// --- Monte Carlo on the current layout ----------------------------------------------

function CurrentMonteCarlo() {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const mc = usePlan((s) => s.mc.current);
  const [years, setYears] = useState<number>(MC_PRESETS.quick.years);
  const [seeds, setSeeds] = useState<number>(MC_PRESETS.quick.seeds);
  const [baseSeed, setBaseSeed] = useState(1);
  const p = usePlan.getState();
  const run = () => {
    const design = designFromGame(catalog, game, 'Current layout');
    const spec: MonteCarloSpec = { design, siteId: game.site.id, years, seeds, baseSeed };
    p.runMonteCarlo('current', spec);
  };
  const preset = (k: keyof typeof MC_PRESETS) => {
    setYears(MC_PRESETS[k].years);
    setSeeds(MC_PRESETS[k].seeds);
  };
  return (
    <div data-testid="montecarlo">
      <p className="muted">
        Runs the layout on the map, built and mature, through many years of real weather (dry and wet years, warm
        and cold ones, late frosts, heat waves, hail) on {game.site.name}. Each seed is one possible run of years.
      </p>
      <p className="muted small" data-testid="weather-policy">{weatherRiskPolicy(catalog, designFromGame(catalog, game, 'Current layout'), game.site.id)}</p>
      {mc && planningFingerprint(mc.spec.design, mc.spec.siteId) !== planningFingerprint(designFromGame(catalog, game, 'Current layout'), game.site.id) && <p className="warn-text" data-testid="weather-stale">Results describe an earlier layout snapshot. Run again to analyze the current map.</p>}
      <div className="mc-form">
        <div className="row-actions">
          <button className="btn ghost small" onClick={() => preset('quick')}>
            {MC_PRESETS.quick.label}
          </button>
          <button className="btn ghost small" onClick={() => preset('full')}>
            {MC_PRESETS.full.label}
          </button>
        </div>
        <label>
          Years
          <input type="number" min={1} max={50} value={years} onChange={(e) => setYears(Math.max(1, Number(e.target.value) || 1))} data-testid="mc-years" />
        </label>
        <label>
          Seeds
          <input type="number" min={1} max={2000} value={seeds} onChange={(e) => setSeeds(Math.max(1, Number(e.target.value) || 1))} data-testid="mc-seeds" />
        </label>
        <label>
          First seed
          <input type="number" value={baseSeed} onChange={(e) => setBaseSeed(Math.trunc(Number(e.target.value) || 0))} data-testid="mc-base-seed" />
        </label>
        {mc?.running ? (
          <button className="btn danger" onClick={() => p.cancelMonteCarlo('current')} data-testid="mc-cancel">
            Cancel
          </button>
        ) : (
          <button className="btn" onClick={run} data-testid="mc-run">
            Run
          </button>
        )}
      </div>
      {mc && <McProgress mc={mc} />}
      {mc?.error && (
        <p className="warn-text" role="alert">
          {mc.error}
        </p>
      )}
      {mc?.result && <McResult result={mc.result} spec={mc.spec} />}
    </div>
  );
}

function McProgress({ mc }: { mc: McState }) {
  const W = 300;
  return (
    <div className="mc-progress">
      <div
        className="progress"
        role="progressbar"
        aria-label="Weather risk progress"
        aria-valuemin={0}
        aria-valuemax={mc.total}
        aria-valuenow={mc.done}
        style={{ width: W }}
        data-testid="mc-progress"
      >
        <div className="progress-fill" style={{ width: progressWidth(mc.done, mc.total, W) }} />
      </div>
      <span className="muted">
        {mc.done} of {mc.total} seeds{mc.running ? '' : mc.result ? ' · done' : ' · stopped'}
      </span>
    </div>
  );
}

function McResult({ result, spec }: { result: MonteCarloResult; spec: MonteCarloSpec }) {
  const t = monteCarloTable(result);
  const file = `${slug(spec.design.name)}.json`;
  const cmd = `npm run sim -- montecarlo ${file} --site ${spec.siteId} --years ${spec.years} --seeds ${spec.seeds} --seed ${spec.baseSeed}`;
  return (
    <div className="mc-result">
      <h3>Worst-week coverage per need, across runs</h3>
      <p className="muted small">Run snapshot: {spec.design.name} on {spec.siteId}. {weatherRiskPolicy(useGame.getState().catalog, spec.design, spec.siteId)}</p>
      <table className="mc-table" data-testid="mc-table">
          <caption>{`Worst-week coverage across ${spec.years}-year runs.`}</caption>
        <thead>
          <tr>
            {t.headers.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
            <th scope="col">Spread</th>
          </tr>
        </thead>
        <tbody>
          {t.rows.map((row, i) => (
            <tr key={row[0]}>
              <th scope="row">{row[0]}</th>
              {row.slice(1).map((c, j) => (
                <td key={j}>{c}</td>
              ))}
              <td>
                <Histogram counts={result.rows[i]!.histogram} need={row[0]!} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="mc-lines" data-testid="mc-lines">
        {t.lines.map((l) => (
          <li key={l} data-testid={l.startsWith('Digest') ? 'mc-digest' : undefined}>
            {l}
          </li>
        ))}
      </ul>
      <div className="row-actions">
        <button className="btn" onClick={() => download(file, `${JSON.stringify(spec.design, null, 2)}\n`)} data-testid="mc-download-design">
          Download design file
        </button>
        <button
          className="btn ghost"
          onClick={() => download(`${slug(spec.design.name)}-montecarlo.json`, `${JSON.stringify(result, null, 2)}\n`)}
          data-testid="mc-download-result"
        >
          Download results
        </button>
      </div>
      <p className="muted">Reproduce these exact numbers from the command line:</p>
      <pre className="cli" data-testid="mc-cli">
        {cmd}
      </pre>
    </div>
  );
}

function Histogram({ counts, need }: { counts: number[]; need: string }) {
  const W = 90;
  const H = 22;
  const bars = histogramBars(counts, W, H);
  return (
    <svg width={W} height={H} role="img" aria-label={`${need}: runs by worst-week coverage, 0% to 100% in tenths: ${counts.join(', ')}`}>
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} className="hist-bar" />
      ))}
    </svg>
  );
}

// --- Sensitivity ------------------------------------------------------------------

function SensitivityTab() {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const t = useMemo(
    () => { const b = planningBaseline(game, catalog); return sensitivity(catalog, b.assumptions, b.design); },
    [game.instances, game.site, catalog], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const W = 360;
  const axis = tornadoAxis(t.bars);
  return (
    <div data-testid="sensitivity">
      <p className="muted">
        How far the average-year score moves if each site number is {fmtPct(t.delta)} lower or higher. Longest
        bars first. The line is the planned-design forecast score ({finePct(t.baseScore)}); the axis runs from {fmtPct(axis.from)} to{' '}
        {fmtPct(axis.to)}.
      </p>
      <table className="tornado" data-testid="tornado">
          <caption>Planned design forecast over an average climate year.</caption>
        <tbody>
          {t.bars.map((b) => {
            const g = tornadoBar(b.low, b.high, b.base, W, axis);
            return (
              <tr key={b.key}>
                <th scope="row">{b.label}</th>
                <td className="num">{finePct(b.low)}<br />{points(b.lowDelta)}</td>
                <td>
                  <svg width={W} height={16} role="img" aria-label={`${b.label}: ${finePct(b.low)} at −${fmtPct(t.delta)}, ${finePct(b.high)} at +${fmtPct(t.delta)}`}>
                    <rect x={0} y={7} width={W} height={2} className="axis" />
                    <rect x={g.x} y={2} width={g.w} height={12} className={b.high >= b.low ? 'bar-up' : 'bar-down'} />
                    <rect x={g.base - 1} y={0} width={2} height={16} className="base-line" />
                  </svg>
                </td>
                <td className="num">{finePct(b.high)}<br />{points(b.highDelta)}<br /><span className="muted small">{b.activity === 'inactive' ? 'No modeled flow changes' : b.activity === 'no-score-change' ? 'Flows change; score unchanged' : 'Score responds'}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h3>
        {t.weakest
          ? `Flows that matter most to ${t.weakest.need} (now ${fmtPct(t.weakest.pct)} covered)`
          : 'Every need is fully covered in an average year.'}
      </h3>
      {t.flows.length > 0 && (
        <table className="flows-table" data-testid="sensitive-flows">
          <caption>Catalog rates as weekly equivalents; capacities as labeled.</caption>
          <thead>
            <tr>
              <th scope="col">System</th>
              <th scope="col">Flow</th>
              <th scope="col">Per week</th>
              <th scope="col">At −{fmtPct(t.delta)}</th>
              <th scope="col">At +{fmtPct(t.delta)}</th>
            </tr>
          </thead>
          <tbody>
            {t.flows.map((f) => (
              <tr key={f.flowId}>
                <td>{f.system}</td>
                <td>
                  {f.side === 'provides' ? 'makes' : 'needs'} {f.resource}
                </td>
                <td className="num">{fmtNum(f.weekly)}</td>
                <td className="num">{finePct(f.low)}</td>
                <td className="num">{finePct(f.high)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// --- Export -----------------------------------------------------------------------

function ExportTab() {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const toast = useGame((s) => s.toast);
  const years = [...new Set(game.ledgers.map((l) => l.year + 1))];
  const base = slug(`${game.site.id}-day-${game.calendar.absDay}`);
  return (
    <div data-testid="export">
      <ul className="export-list">
        <li>
          <button
            className="btn"
            onClick={() => download(`${base}.design.json`, `${JSON.stringify(designFromGame(catalog, game, 'My homestead'), null, 2)}\n`)}
            data-testid="export-design"
          >
            Design file
          </button>
          <span className="muted">Every system and where it sits. Opens in Scenarios and in the command-line simulator.</span>
        </li>
        <li>
          <button
            className="btn"
            disabled={!game.ledgers.length}
            onClick={() => download(`${base}.flow-record.json`, `${JSON.stringify(flowRecords(catalog, game), null, 2)}\n`)}
            data-testid="export-flow-record"
          >
            Flow record
          </button>
          <span className="muted">
            One record per game year ({years.length ? `year ${years.join(', ')}` : 'play a few days first'}): land by use,
            monthly power bought, made, spilled and peak, water drawn and used up, food grown and bought, fuel, spending,
            labor, and hardship months (homestead.flow_record.v1).
          </span>
        </li>
        <li>
          <button
            className="btn"
            disabled={!game.ledgers.length}
            onClick={() => download(`${base}.ledgers.csv`, ledgersCsv(catalog, game.ledgers), 'text/csv')}
            data-testid="export-csv"
          >
            Daily ledgers (CSV)
          </button>
          <span className="muted">One row per day for the last {game.ledgers.length} days.</span>
        </li>
        <li>
          <button
            className="btn"
            onClick={() => {
              const scene = window.__homestead?.scene;
              if (!scene) return;
              scene.snapshotPng().then(
                (b) => download(`${base}.map.png`, b),
                (e: Error) => toast(e.message, 'warn'),
              );
            }}
            data-testid="export-png"
          >
            Map picture (PNG)
          </button>
          <span className="muted">The map as it looks right now.</span>
        </li>
      </ul>
    </div>
  );
}
