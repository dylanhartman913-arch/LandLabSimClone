import { useMemo } from 'react';
import { designBalance, displayDate, ENGINE_VERSION, hudMetrics, weeklyBills } from '@homestead/engine';
import { fmtMoney, fmtNum, fmtPct } from '../lib/format.ts';
import { useGame, type Speed } from '../store/game.ts';
import { usePlan } from '../store/plan.ts';
import { ScoreRing } from './ScoreRing.tsx';
import { WhyNum } from './Why.tsx';
import { weatherKind, WeatherIcon } from './Weather.tsx';

const SPEEDS: { s: Speed; label: string; key: string }[] = [
  { s: 0, label: 'Pause', key: 'Space' },
  { s: 1, label: '1×', key: '1' },
  { s: 3, label: '3×', key: '2' },
  { s: 10, label: '10×', key: '3' },
];

const SEASON_LABEL = { spring: 'Spring', summer: 'Summer', fall: 'Fall', winter: 'Winter' };

export function Hud() {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const speed = useGame((s) => s.speed);
  const overlayOn = useGame((s) => s.overlay.on);
  const panel = useGame((s) => s.panel);
  const reportCount = useGame((s) => s.reports.length);
  const readOnly = useGame((s) => s.readOnly);
  const planOpen = usePlan((s) => s.open);
  const st = useGame.getState();
  const setSpeed = useGame((s) => s.setSpeed);
  const zoomToFit = useGame((s) => s.zoomToFit);
  const bal = useMemo(() => designBalance(game, catalog), [game.instances, game.site, catalog]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = hudMetrics(game, catalog, bal);
  const bills = useMemo(() => (m.headline === 'self-reliance' ? weeklyBills(game) : null), [game.ledgers, m.headline]); // eslint-disable-line react-hooks/exhaustive-deps
  const wk = weatherKind(m.weather, m.season);
  return (
    <header className="hud" data-testid="hud">
      <div className="hud-brand">
        <span className="brand-mark" aria-hidden="true">
          ◆
        </span>
        <div>
          <h1 className="brand-name">TERRA Homestead Plugin</h1>
          <span className="sr-only" data-testid="engine-version">
            Engine {ENGINE_VERSION}
          </span>
          <div className="hud-land">
            {game.site.name}
            {game.settings.weatherMode === 'real' ? ' · real weather' : ''}
            {readOnly ? ' · shared design (read only)' : ''}
          </div>
        </div>
      </div>
      <div className="hud-group" aria-label="Date">
        <WeatherIcon kind={wk} />
        <div>
          <div className="hud-strong" data-testid="hud-date">
            {displayDate(game.calendar.day, game.calendar.year).label}
          </div>
          <div className="hud-sub" data-testid="hud-real-date">
            {m.date.replace(/, year \d+$/, '')} · {SEASON_LABEL[m.season]}
            {m.weather.tags.length ? ` · ${m.weather.tags.join(', ')}` : ''}
          </div>
        </div>
      </div>
      <div className="hud-group">
        <div>
          <div className="hud-sub">Cash</div>
          <div className={`hud-strong ${m.cash.value < 0 ? 'neg' : ''}`} data-testid="hud-cash">
            <WhyNum value={m.cash} title="Cash" format={fmtMoney} />
          </div>
        </div>
      </div>
      <div className="hud-group">
        <div>
          <div className="hud-sub">Labor this week</div>
          <div className="hud-strong" data-testid="hud-labor">
            <WhyNum value={m.laborUsedWeek} title="Labor used this week" format={fmtNum} /> /{' '}
            <WhyNum value={m.laborAvailableWeek} title="Labor available this week" format={fmtNum} unit="h" />
          </div>
        </div>
      </div>
      {bills && (
        <>
          <div className="hud-group hud-headline" data-testid="hud-self-reliance">
            <div>
              <div className="hud-sub">Self-reliance</div>
              <div className="hud-strong big">
                <WhyNum value={m.selfReliance} title="Self-reliance" format={fmtPct} />
              </div>
            </div>
          </div>
          <button
            className="hud-group hud-headline"
            onClick={() => st.setPanel(panel === 'market' ? null : 'market')}
            title="Weekly bills (M)"
            data-testid="hud-bills"
          >
            <div>
              <div className="hud-sub">Weekly bills</div>
              <div className="hud-strong big">{fmtMoney(bills.thisWeek.value)}</div>
            </div>
          </button>
        </>
      )}
      <button
        className={`hud-group hud-score ${bills ? 'secondary' : ''}`}
        onClick={() => useGame.getState().setChecklist(true)}
        title="Open the needs checklist (N)"
        data-testid="open-checklist"
      >
        <ScoreRing score={m.score} label="Off-grid score (average year)" />
        <span className="hud-sub">
          Off-grid score
          <br />
          <span className="hud-potential" data-testid="hud-potential">
            {fmtPct(m.potentialScore.value)} if supplied
          </span>
        </span>
      </button>
      <button
        className={`btn ghost ${overlayOn ? 'on' : ''}`}
        onClick={() => useGame.getState().setOverlay({ on: !overlayOn })}
        title="Show flows (F)"
        aria-pressed={overlayOn}
        data-testid="toggle-flows"
      >
        Flows
      </button>
      <div className="hud-spacer" />
      <nav className="hud-group" aria-label="Panels">
        <button
          className={`btn ghost ${planOpen ? 'on' : ''}`}
          onClick={() => usePlan.getState().setOpen(!planOpen)}
          title="Scenarios, weather risk, sensitivity, and exports (P)"
          aria-pressed={planOpen}
          data-testid="open-plan"
        >
          Plan
        </button>
        <button
          className="btn ghost"
          onClick={() => st.setPanel(panel === 'work' ? null : 'work')}
          title="Work priorities and auto-gather (J)"
          data-testid="open-work"
        >
          Work
        </button>
        <button
          className="btn ghost"
          onClick={() => st.setPanel(panel === 'market' ? null : 'market')}
          title="Market and weekly bills (M)"
          data-testid="open-market"
        >
          Market
        </button>
        <button
          className="btn ghost"
          onClick={() => st.setPanel(panel === 'almanac' ? null : 'almanac')}
          title="Almanac (L)"
          data-testid="open-almanac"
        >
          Almanac
        </button>
        <button
          className="btn ghost"
          onClick={() => st.setPanel(panel === 'report' ? null : 'report')}
          data-testid="open-reports"
        >
          Reports{reportCount ? ` (${reportCount})` : ''}
        </button>
        <button
          className="btn ghost"
          onClick={() => st.setPanel(panel === 'saves' ? null : 'saves')}
          data-testid="open-saves"
        >
          Save
        </button>
        <button
          className="btn ghost"
          onClick={() => st.setPanel(panel === 'settings' ? null : 'settings')}
          aria-label="Settings"
          data-testid="open-settings"
        >
          ⚙
        </button>
      </nav>
      <button className="btn ghost" onClick={zoomToFit} title="Zoom to fit (0)" aria-label="Zoom to fit">
        ⤢
      </button>
      <div className="speed" role="group" aria-label="Game speed">
        {SPEEDS.map((x) => (
          <button
            key={x.s}
            className={`btn speed-btn ${speed === x.s ? 'on' : ''}`}
            aria-pressed={speed === x.s}
            onClick={() => setSpeed(x.s)}
            title={`${x.label} (${x.key})`}
            data-testid={`speed-${x.s}`}
          >
            {x.s === 0 ? '❚❚' : x.label}
          </button>
        ))}
      </div>
    </header>
  );
}
