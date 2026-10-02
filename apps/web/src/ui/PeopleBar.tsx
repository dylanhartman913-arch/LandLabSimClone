import { useMemo } from 'react';
import { peopleView, stockpileView } from '@homestead/engine';
import { fmtNum } from '../lib/format.ts';
import { useGame } from '../store/game.ts';
import { WhyNum } from './Why.tsx';

const ARROW = { up: '▲', down: '▼', flat: '▬' } as const;
const TREND_WORD = { up: 'rising', down: 'falling', flat: 'steady' } as const;

/** Days of food, drinking water, firewood, and battery, with a trend (G15 stockpile bar). */
export function StockpileBar() {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const items = useMemo(() => stockpileView(game, catalog), [game, catalog]);
  return (
    <div className="stockpile" role="group" aria-label="Stockpile" data-testid="stockpile">
      {items.map((it) => (
        <div key={it.key} className={`stock-chip ${it.red ? 'red' : ''}`} data-testid={`stock-${it.key}`}>
          <button className="link stock-label" onClick={() => useGame.getState().openResource(it.resource)}>
            {it.label}
          </button>
          <WhyNum
            value={it.days}
            title={`Days of ${it.label.toLowerCase()}`}
            format={(n) => (Number.isFinite(n) ? `${fmtNum(n)} d` : '—')}
            testId={`stock-days-${it.key}`}
          />
          <span className={`trend ${it.trend}`} aria-label={TREND_WORD[it.trend]} title={`${TREND_WORD[it.trend]} over the last week`}>
            {ARROW[it.trend]}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Each person's wellbeing bar and the top reason it is moving today (G15). */
export function PeopleBar() {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const people = useMemo(() => peopleView(game, catalog), [game, catalog]);
  if (!people.length) return null;
  return (
    <div className="people" role="group" aria-label="People" data-testid="people">
      {people.map((p) => {
        const wb = p.wellbeing.value;
        const tone = p.away ? 'away' : wb < 30 ? 'bad' : wb < 60 ? 'warn' : 'good';
        return (
          <div key={p.id} className={`person ${tone}`} data-testid={`person-${p.id}`}>
            <div className="person-head">
              <button className="link" onClick={() => useGame.getState().focusInstance(p.id)}>
                {p.label}
              </button>
              <WhyNum value={p.wellbeing} title={`${p.label}: wellbeing`} format={(n) => `${Math.round(n)}`} testId={`wellbeing-${p.id}`} />
            </div>
            <div
              className="wb-bar"
              role="meter"
              aria-label={`${p.label} wellbeing`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(wb)}
            >
              <span style={{ width: `${Math.max(0, Math.min(100, wb))}%` }} />
            </div>
            <div className="person-why muted small" data-testid={`person-why-${p.id}`}>
              {p.away
                ? 'Staying in town until home has food, water, and shelter'
                : p.topReason
                  ? `${p.topReason.points >= 0 ? '▲' : '▼'} ${p.topReason.label}`
                  : 'Steady'}
            </div>
          </div>
        );
      })}
    </div>
  );
}
