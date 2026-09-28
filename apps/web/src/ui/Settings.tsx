import { useGame } from '../store/game.ts';
import { AUTO_PAUSE_LABELS, type AutoPauseKey } from '../store/prefs.ts';

/** Settings: units, speed, auto-pause, snap, accessibility, and the one game setting (work split). */
export function Settings() {
  const prefs = useGame((s) => s.prefs);
  const share = useGame((s) => s.game.settings.constructionShare);
  const st = useGame.getState();
  return (
    <section className="panel" role="dialog" aria-label="Settings" data-testid="settings">
      <header className="panel-head">
        <h2>Settings</h2>
        <button className="btn ghost" onClick={() => st.setPanel(null)} aria-label="Close settings">
          ✕
        </button>
      </header>
      <div className="form">
        <label>
          Units
          <select
            value={prefs.units}
            onChange={(e) => st.setPrefs({ units: e.target.value as 'imperial' | 'metric' })}
            data-testid="units"
          >
            <option value="imperial">Imperial (gal, lbs, sq ft)</option>
            <option value="metric">Metric (L, kg, m²)</option>
          </select>
        </label>
        <label>
          Play speed when resuming
          <select
            value={prefs.defaultSpeed}
            onChange={(e) => st.setPrefs({ defaultSpeed: Number(e.target.value) as 1 | 3 | 10 })}
          >
            <option value={1}>1×</option>
            <option value={3}>3×</option>
            <option value={10}>10×</option>
          </select>
        </label>
        <label>
          Grid snap
          <select
            value={prefs.snap}
            onChange={(e) => st.setPrefs({ snap: Number(e.target.value) as 0 | 1 | 5 | 10 })}
          >
            <option value={0}>Off</option>
            <option value={1}>1 ft</option>
            <option value={5}>5 ft</option>
            <option value={10}>10 ft</option>
          </select>
        </label>
        <label>
          UI scale
          <input
            type="range"
            min={0.8}
            max={1.4}
            step={0.1}
            value={prefs.uiScale}
            onChange={(e) => st.setPrefs({ uiScale: Number(e.target.value) })}
            aria-valuetext={`${Math.round(prefs.uiScale * 100)}%`}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={prefs.colorblind}
            onChange={(e) => st.setPrefs({ colorblind: e.target.checked })}
          />
          Colorblind-safe palette
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={prefs.reducedMotion}
            onChange={(e) => st.setPrefs({ reducedMotion: e.target.checked })}
            data-testid="reduced-motion"
          />
          Reduce motion
        </label>
      </div>
      <h3>Pause automatically when…</h3>
      <div className="form">
        {(Object.keys(AUTO_PAUSE_LABELS) as AutoPauseKey[]).map((k) => (
          <label key={k} className="check">
            <input
              type="checkbox"
              checked={prefs.autoPause[k]}
              onChange={(e) => st.setPrefs({ autoPause: { ...prefs.autoPause, [k]: e.target.checked } })}
              data-testid={`autopause-${k}`}
            />
            {AUTO_PAUSE_LABELS[k]}
          </label>
        ))}
      </div>
      <h3>Household work split</h3>
      <label className="form">
        Share of each day's work that goes to building first: {Math.round(share * 100)}%
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={share}
          onChange={(e) => st.setGameSettings({ constructionShare: Number(e.target.value) })}
          data-testid="construction-share"
        />
      </label>
      <p className="muted small">
        The work split is part of the game (undo with Ctrl-Z). Everything else here is a preference for this
        browser.
      </p>
    </section>
  );
}
