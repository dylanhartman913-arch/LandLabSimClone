import { useState } from 'react';
import { dateLabel, getSystem, type GameEvent } from '@homestead/engine';
import { fmtMoney, fmtNum } from '../lib/format.ts';
import { useGame } from '../store/game.ts';

type Filter = 'shortages' | 'harvests' | 'builds' | 'weather' | 'money' | 'people';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'shortages', label: 'Shortages' },
  { id: 'harvests', label: 'Harvests' },
  { id: 'builds', label: 'Builds' },
  { id: 'people', label: 'People' },
  { id: 'weather', label: 'Weather' },
  { id: 'money', label: 'Money' },
];

function filterOf(e: GameEvent): Filter {
  switch (e.kind) {
    case 'shortage':
    case 'shortage-ended':
    case 'spill':
    case 'spoilage':
      return e.kind === 'shortage' && e.resource === 'Capital' ? 'money' : 'shortages';
    case 'harvest':
      return 'harvests';
    case 'built':
    case 'imported':
      return 'builds';
    case 'hardship':
    case 'health':
      return 'people';
    case 'purchases-stopped':
    case 'market':
      return 'money';
  }
}

/** One line of plain language per engine event. */
export function describeEvent(
  e: GameEvent,
  name: (systemId: string) => string,
  instSys: (id: string) => string | null,
): string {
  switch (e.kind) {
    case 'shortage':
      return `Short on ${e.resource}: ${fmtNum(e.unmet)} of ${fmtNum(e.requested)} unmet${e.curtailed.length ? `, slowing ${e.curtailed.length} system${e.curtailed.length === 1 ? '' : 's'}` : ''}.`;
    case 'shortage-ended':
      return `${e.resource} is back to full supply.`;
    case 'spill':
      return `Electricity is spilling: ${fmtNum(e.amount)} kWh had nowhere to go.`;
    case 'spoilage':
      return `Spoiled this week: ${Object.entries(e.byResource)
        .map(([r, v]) => `${fmtNum(v)} ${r}`)
        .join(', ')}.`;
    case 'harvest':
      return `Harvest time: ${name(e.systemId)} yields ${e.resource}.`;
    case 'built': {
      return `${name(e.systemId)} is built.`;
    }
    case 'imported':
      return `Brought in ${fmtNum(e.amount)} ${e.resource} to build ${instSys(e.instanceId) ?? 'a system'}.`;
    case 'hardship':
      return `Hardship: only ${Math.round(e.level * 100)}% of ${e.need === 'drinkingWater' ? 'drinking water' : e.need} needs met for 3+ days.`;
    case 'health':
      return `Health fell to ${Math.round(e.health * 100)}%.`;
    case 'purchases-stopped':
      return `Out of money: purchases stopped (cash ${fmtMoney(e.cash)}). Groceries, power, and market orders wait until there is cash again.`;
    case 'market':
      return `Market run (${e.trip === 'delivery' ? 'delivered, $25' : 'own transport'}): ${Object.entries(e.bought)
        .map(([r, v]) => `${fmtNum(v)} ${r}`)
        .join(', ')} for ${fmtMoney(e.cost)}.`;
  }
}

function instanceOf(e: GameEvent): string | undefined {
  switch (e.kind) {
    case 'built':
    case 'imported':
    case 'hardship':
    case 'health':
      return e.instanceId;
    case 'harvest':
      return e.instanceIds[0];
    case 'shortage':
      return e.curtailed[0];
    default:
      return undefined;
  }
}

/** The almanac (L): every event, newest first, filterable, each linked to the map. */
export function Almanac() {
  const events = useGame((s) => s.events);
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const [on, setOn] = useState<Set<Filter>>(new Set(FILTERS.map((f) => f.id)));
  const st = useGame.getState();
  const name = (id: string) => getSystem(catalog, id).name;
  const instSys = (id: string) => {
    const i = game.instances.find((x) => x.id === id);
    return i ? name(i.systemId) : null;
  };
  // Weather is read from the ledgers (frosts), not from events.
  const weather = on.has('weather')
    ? game.ledgers
        .filter((l) => l.weather.tags.length)
        .map((l) => ({
          absDay: l.absDay,
          day: l.day,
          year: l.year,
          text: `Weather: ${l.weather.tags.join(', ')}.`,
        }))
    : [];
  const rows = [
    ...events
      .filter((e) => on.has(filterOf(e)))
      .map((e, k) => ({
        key: `e${k}`,
        absDay: e.absDay,
        text: describeEvent(e, name, instSys),
        inst: instanceOf(e),
        kind: filterOf(e),
      })),
    ...weather.map((w, k) => ({
      key: `w${k}`,
      absDay: w.absDay,
      text: w.text,
      inst: undefined,
      kind: 'weather' as Filter,
    })),
  ].sort((a, b) => b.absDay - a.absDay);
  // Absolute day 0 is the game's start day.
  const start = game.settings.startDay ?? 0;
  const label = (absDay: number) => dateLabel((start + absDay) % 365, Math.floor((start + absDay) / 365));
  return (
    <section className="panel" role="dialog" aria-label="Almanac" data-testid="almanac">
      <header className="panel-head">
        <h2>Almanac</h2>
        <button className="btn ghost" onClick={() => st.setPanel(null)} aria-label="Close almanac">
          ✕
        </button>
      </header>
      <div className="filters" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <label key={f.id} className="check">
            <input
              type="checkbox"
              checked={on.has(f.id)}
              onChange={() => {
                const next = new Set(on);
                if (next.has(f.id)) next.delete(f.id);
                else next.add(f.id);
                setOn(next);
              }}
              data-testid={`almanac-${f.id}`}
            />
            {f.label}
          </label>
        ))}
      </div>
      {rows.length === 0 && <p className="empty">Nothing yet. Events appear here as the days pass.</p>}
      <ol className="almanac-list">
        {rows.slice(0, 400).map((r) => (
          <li key={r.key} className={`alm alm-${r.kind}`}>
            <span className="alm-date">{label(r.absDay)}</span>
            <span>{r.text}</span>
            {r.inst && game.instances.some((i) => i.id === r.inst) && (
              <button className="link" onClick={() => st.focusInstance(r.inst!)}>
                Show on map
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
