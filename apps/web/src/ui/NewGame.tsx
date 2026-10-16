import { useState } from 'react';
import { SITES, STARTS, type Difficulty } from '@homestead/catalog';
import { KIT_LABELS, newGameFromOptions, startGame, type GameInit, type StartingKit } from '@homestead/engine';
import { fmtMoney } from '../lib/format.ts';
import { useGame } from '../store/game.ts';
import { savePref } from '../store/persist.ts';

const ACRES = [
  { v: 0.25, label: '¼ acre' },
  { v: 1, label: '1 acre' },
  { v: 5, label: '5 acres' },
];
const CASH = [25_000, 50_000, 100_000, 250_000];

const ACRE_LABEL = (a: number) => (a === 0.25 ? '¼ acre' : a === 1 ? '1 acre' : `${a} acres`);
const DIFFICULTIES: Difficulty[] = ['gentle', 'standard', 'real'];

/** The start screen (G15): two ways to start, then site, household, and difficulty. */
export function NewGame() {
  const open = useGame((s) => s.wizardOpen);
  const [custom, setCustom] = useState(false);
  const [startId, setStartId] = useState('greenfield');
  const [siteId, setSite] = useState('front-range');
  const [household, setHousehold] = useState(2);
  const [difficulty, setDifficulty] = useState<Difficulty>('standard');
  if (!open) return null;
  if (custom) return <CustomGame onBack={() => setCustom(false)} />;
  const st = useGame.getState();
  const begin = () => {
    const init: GameInit = {
      siteId,
      seed: Math.floor(Math.random() * 2 ** 31), // UI-side: the seed is then saved with the game
      settings: {},
      start: { id: startId, difficulty, household },
    };
    try {
      st.loadGame(init, [], startGame(st.catalog, init));
      st.setWizard(false);
      savePref('seenWizard', true);
      st.toast(`${STARTS[startId]!.title} on ${SITES[siteId]!.name}.`);
    } catch (e) {
      st.toast(e instanceof Error ? e.message : String(e), 'warn');
    }
  };
  const chosen = STARTS[startId]!;
  return (
    <div className="modal-back">
      <section className="modal" role="dialog" aria-label="New game" data-testid="new-game">
        <header className="panel-head">
          <h2>Start a homestead</h2>
          <button className="btn ghost" onClick={() => st.setWizard(false)} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="start-cards" role="radiogroup" aria-label="How to start">
          {Object.values(STARTS)
            .sort((a, b) => (a.id === 'adapt' ? -1 : b.id === 'adapt' ? 1 : 0))
            .map((x) => (
              <button
                key={x.id}
                role="radio"
                aria-checked={startId === x.id}
                className={`choice start-card ${startId === x.id ? 'on' : ''}`}
                onClick={() => {
                  setStartId(x.id);
                  setHousehold(x.household.default);
                }}
                data-testid={`start-${x.id}`}
              >
                <h3>{x.title}</h3>
                <span className="muted">{x.pitch}</span>
                <span className="facts small">
                  <span>{ACRE_LABEL(x.parcelAcres)}</span>
                  <span>{fmtMoney(x.cash)}</span>
                </span>
                <strong className="small">Starting kit</strong>
                <ul className="small">
                  {x.preview.kit.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
                <strong className="small">Stockpile</strong>
                <ul className="small">
                  {x.preview.stockpile.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
              </button>
            ))}
        </div>
        <h3>Land</h3>
        <div className="choice-grid" role="radiogroup" aria-label="Site">
          {Object.values(SITES).map((x) => (
            <button
              key={x.id}
              role="radio"
              aria-checked={siteId === x.id}
              className={`choice ${siteId === x.id ? 'on' : ''}`}
              onClick={() => setSite(x.id)}
              data-testid={`site-${x.id}`}
            >
              <strong>{x.name}</strong>
              <span className="muted small">{x.description}</span>
            </button>
          ))}
        </div>
        <div className="wizard-row">
          <label>
            Household (adults)
            <input
              type="number"
              min={chosen.household.min}
              max={chosen.household.max}
              value={household}
              onChange={(e) =>
                setHousehold(Math.max(chosen.household.min, Math.min(chosen.household.max, Number(e.target.value))))
              }
              data-testid="start-household"
            />
          </label>
        </div>
        <h3>Difficulty</h3>
        <div className="choice-grid three" role="radiogroup" aria-label="Difficulty">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              role="radio"
              aria-checked={difficulty === d}
              className={`choice ${difficulty === d ? 'on' : ''}`}
              onClick={() => setDifficulty(d)}
              data-testid={`difficulty-${d}`}
            >
              <strong>{chosen.difficulty[d]?.label}</strong>
              <span className="muted small">{chosen.difficulty[d]?.blurb}</span>
            </button>
          ))}
        </div>
        <div className="row end">
          <button className="btn ghost" onClick={() => setCustom(true)} data-testid="custom-game">
            Custom game…
          </button>
          <button className="btn primary" onClick={begin} data-testid="start-begin">
            Start
          </button>
        </div>
      </section>
    </div>
  );
}

/** A custom game: site, parcel, money, household, weather, and a starting kit. */
function CustomGame({ onBack }: { onBack: () => void }) {
  const [siteId, setSite] = useState('front-range');
  const [acres, setAcres] = useState(1);
  const [cash, setCash] = useState(100_000);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [weather, setWeather] = useState<'average' | 'real'>('average');
  const [kit, setKit] = useState<StartingKit>('tent');
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
          <button className="btn ghost" onClick={onBack} aria-label="Back" data-testid="custom-back">
            ←
          </button>
          <h2>Custom game</h2>
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
