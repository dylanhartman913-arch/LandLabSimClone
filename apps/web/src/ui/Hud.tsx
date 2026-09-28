import { useMemo } from 'react';
import { designBalance, ENGINE_VERSION, hudMetrics } from '@homestead/engine';
import { fmtMoney, fmtNum } from '../lib/format.ts';
import { useGame, type Speed } from '../store/game.ts';
import { ScoreRing } from './ScoreRing.tsx';
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
  const setSpeed = useGame((s) => s.setSpeed);
  const snap = useGame((s) => s.snap);
  const setSnap = useGame((s) => s.setSnap);
  const zoomToFit = useGame((s) => s.zoomToFit);
  const bal = useMemo(() => designBalance(game, catalog), [game.instances, game.site, catalog]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = hudMetrics(game, catalog, bal);
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
          <div className="hud-land">{game.site.name}</div>
        </div>
      </div>
      <div className="hud-group" aria-label="Date">
        <WeatherIcon kind={wk} />
        <div>
          <div className="hud-strong" data-testid="hud-date">
            {m.date}
          </div>
          <div className="hud-sub">
            {SEASON_LABEL[m.season]}
            {m.weather.tags.length ? ` · ${m.weather.tags.join(', ')}` : ''}
          </div>
        </div>
      </div>
      <div className="hud-group" title={m.cash.explain.formula}>
        <div>
          <div className="hud-sub">Cash</div>
          <div className={`hud-strong ${m.cash.value < 0 ? 'neg' : ''}`} data-testid="hud-cash">
            {fmtMoney(m.cash.value)}
          </div>
        </div>
      </div>
      <div
        className="hud-group"
        title={`${m.laborUsedWeek.explain.formula} / ${m.laborAvailableWeek.explain.formula}`}
      >
        <div>
          <div className="hud-sub">Labor this week</div>
          <div className="hud-strong" data-testid="hud-labor">
            {fmtNum(m.laborUsedWeek.value)} / {fmtNum(m.laborAvailableWeek.value)} h
          </div>
        </div>
      </div>
      <div className="hud-group">
        <ScoreRing score={m.score} label="Off-grid score (average year)" />
        <div className="hud-sub">
          Off-grid
          <br />
          score
        </div>
      </div>
      <div className="hud-spacer" />
      <div className="hud-group" role="group" aria-label="Grid snap">
        <label className="hud-sub" htmlFor="snap">
          Snap
        </label>
        <select
          id="snap"
          value={snap}
          onChange={(e) => setSnap(Number(e.target.value) as 0 | 1 | 5 | 10)}
          aria-label="Grid snap"
        >
          <option value={0}>Off</option>
          <option value={1}>1 ft</option>
          <option value={5}>5 ft</option>
          <option value={10}>10 ft</option>
        </select>
        <button className="btn ghost" onClick={zoomToFit} title="Zoom to fit (0)" aria-label="Zoom to fit">
          ⤢
        </button>
      </div>
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
