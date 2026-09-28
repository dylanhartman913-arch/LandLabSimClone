import { useState } from 'react';
import { SITES } from '@homestead/catalog';
import { KIT_LABELS, newGameFromOptions, type StartingKit } from '@homestead/engine';
import { fmtMoney } from '../lib/format.ts';
import { useGame } from '../store/game.ts';
import { savePref } from '../store/persist.ts';

const ACRES = [
  { v: 0.25, label: '¼ acre' },
  { v: 1, label: '1 acre' },
  { v: 5, label: '5 acres' },
];
const CASH = [25_000, 50_000, 100_000, 250_000];

/** New game: site, parcel, money, household, weather, and a starting kit. */
export function NewGame() {
  const open = useGame((s) => s.wizardOpen);
  const [siteId, setSite] = useState('front-range');
  const [acres, setAcres] = useState(1);
  const [cash, setCash] = useState(100_000);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [weather, setWeather] = useState<'average' | 'real'>('average');
  const [kit, setKit] = useState<StartingKit>('tent');
  if (!open) return null;
  const st = useGame.getState();
  const site = SITES[siteId]!;
  const start = () => {
    const seed = Math.floor(Math.random() * 2 ** 31); // UI-side: the seed is then saved with the game
    try {
      const r = newGameFromOptions(st.catalog, {
        siteId,
        parcelAcres: acres,
        startingCash: cash,
        adults,
        children,
        weatherMode: weather,
        kit,
        seed,
      });
      st.loadGame(r.init, r.actions, r.game);
      st.setWizard(false);
      savePref('seenWizard', true);
      st.toast(`New homestead on ${site.name}.`);
    } catch (e) {
      st.toast(e instanceof Error ? e.message : String(e), 'warn');
    }
  };
  return (
    <div className="modal-back">
      <section className="modal" role="dialog" aria-label="New game" data-testid="new-game">
        <header className="panel-head">
          <h2>Start a homestead</h2>
          <button className="btn ghost" onClick={() => st.setWizard(false)} aria-label="Close">
            ✕
          </button>
        </header>
        <h3>Land</h3>
        <div className="choice-grid" role="radiogroup" aria-label="Site">
          {Object.values(SITES).map((s) => (
            <button
              key={s.id}
              role="radio"
              aria-checked={siteId === s.id}
              className={`choice ${siteId === s.id ? 'on' : ''}`}
              onClick={() => setSite(s.id)}
              data-testid={`site-${s.id}`}
            >
              <strong>{s.name}</strong>
              <span className="muted small">{s.description}</span>
              <span className="small">
                {s.assumptions.hdd.toLocaleString()} heating degree-days · {s.assumptions.precipIn} in of rain
                · {s.growingSeason.endDay - s.growingSeason.startDay + 1}-day season · {s.terrain.slopePct}%
                slope
                {s.ambient['Stream flow'] ? ' · creek' : ''}
              </span>
            </button>
          ))}
        </div>
        <div className="wizard-row">
          <label>
            Parcel
            <select
              value={acres}
              onChange={(e) => setAcres(Number(e.target.value))}
              data-testid="wizard-acres"
            >
              {ACRES.map((a) => (
                <option key={a.v} value={a.v}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Starting cash
            <select value={cash} onChange={(e) => setCash(Number(e.target.value))}>
              {CASH.map((c) => (
                <option key={c} value={c}>
                  {fmtMoney(c)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Adults
            <input
              type="number"
              min={1}
              max={6}
              value={adults}
              onChange={(e) => setAdults(Math.max(1, Math.min(6, Number(e.target.value))))}
              data-testid="wizard-adults"
            />
          </label>
          <label>
            Children
            <input
              type="number"
              min={0}
              max={6}
              value={children}
              onChange={(e) => setChildren(Math.max(0, Math.min(6, Number(e.target.value))))}
              data-testid="wizard-children"
            />
          </label>
          <label>
            Weather
            <select value={weather} onChange={(e) => setWeather(e.target.value as 'average' | 'real')} data-testid="wizard-weather">
              <option value="average">Average years</option>
              <option value="real">Real weather (varies year to year)</option>
            </select>
          </label>
        </div>
        <h3>Starting kit</h3>
        <div className="choice-grid three" role="radiogroup" aria-label="Starting kit">
          {(Object.keys(KIT_LABELS) as StartingKit[]).map((k) => (
            <button
              key={k}
              role="radio"
              aria-checked={kit === k}
              className={`choice ${kit === k ? 'on' : ''}`}
              onClick={() => setKit(k)}
              data-testid={`kit-${k}`}
            >
              <strong>{KIT_LABELS[k].name}</strong>
              <span className="muted small">{KIT_LABELS[k].blurb}</span>
            </button>
          ))}
        </div>
        <p className="muted small">Children count as 0.6 of an adult for food, water, and work.</p>
        <div className="row end">
          <button className="btn primary" onClick={start} data-testid="wizard-start">
            Start
          </button>
        </div>
      </section>
    </div>
  );
}
