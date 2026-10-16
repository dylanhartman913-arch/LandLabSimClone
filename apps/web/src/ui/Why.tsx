import { useEffect, useRef } from 'react';
import type { Explained } from '@homestead/engine';
import { displayUnit, fmtNum } from '../lib/format.ts';
import { useGame } from '../store/game.ts';

/**
 * A number the player can click to ask "why". Every number on the checklist,
 * the cards, and the HUD goes through this, and the popover shows the engine's
 * provenance: formula, flows, site assumptions, and confidence.
 */
export function WhyNum({
  value,
  title,
  unit,
  format = fmtNum,
  className = '',
  testId,
}: {
  value: Explained;
  title: string;
  unit?: string;
  format?: (n: number) => string;
  className?: string;
  testId?: string;
}) {
  const show = useGame((s) => s.showWhy);
  const units = useGame((s) => s.prefs.units);
  const d = unit ? displayUnit(value.value, unit, units) : { value: value.value, unit };
  return (
    <button
      type="button"
      className={`why ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        show({ title, value, ...(unit ? { unit } : {}), x: r.left, y: r.bottom + 6 });
      }}
      aria-label={`${format(d.value)}${d.unit ? ` ${d.unit}` : ''}: ${title}. Why?`}
      data-testid={testId}
      data-value={value.value}
    >
      {format(d.value)}
      {d.unit ? <span className="why-unit"> {d.unit}</span> : null}
    </button>
  );
}

const ASSUMPTION_LABEL: Record<string, string> = {
  hdd: 'Heating degree-days',
  cdd: 'Cooling degree-days',
  psh: 'Peak sun hours',
  pvDerate: 'PV derate',
  precipIn: 'Annual precipitation',
  galPerSqftIn: 'Gallons per sq ft per inch',
  windCf: 'Wind capacity factor',
  hydroCf: 'Micro-hydro capacity factor',
  seasonsPerYear: 'Growing seasons per year',
};

export function WhyPopover() {
  const why = useGame((s) => s.why);
  const catalog = useGame((s) => s.catalog);
  const site = useGame((s) => s.game.site);
  const close = () => useGame.getState().showWhy(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!why) return;
    ref.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [why]);
  if (!why) return null;
  const e = why.value.explain;
  const sys = (id: string) => catalog.systems.find((s) => s.id === id);
  const flow = (id: string) => catalog.flows.find((f) => f.id === id);
  const confidences = [...new Set(e.terms.map((t) => sys(t.systemId)?.confidence).filter(Boolean))];
  const left = Math.min(why.x, window.innerWidth - 440);
  const top = Math.min(why.y, window.innerHeight - 320);
  return (
    <div
      className="why-pop"
      ref={ref}
      role="dialog"
      aria-label={`Why: ${why.title}`}
      tabIndex={-1}
      style={{ left, top }}
      data-testid="why-popover"
    >
      <header>
        <strong>{why.title}</strong>
        <button className="btn ghost" onClick={close} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="why-value">
        = {fmtNum(why.value.value)}
        {why.unit ? ` ${why.unit}` : ''}
      </div>
      <div className="why-formula" data-testid="why-formula">
        {e.formula}
      </div>
      {e.terms.length > 0 && (
        <table className="why-terms">
          <thead>
            <tr>
              <th>System</th>
              <th>Flow</th>
              <th>qty × factor × count</th>
              <th>=</th>
            </tr>
          </thead>
          <tbody>
            {e.terms.slice(0, 14).map((t) => {
              const f = flow(t.flowId);
              return (
                <tr key={`${t.flowId}-${t.systemId}`}>
                  <td>{sys(t.systemId)?.name ?? t.systemId}</td>
                  <td>
                    {f?.resource}{' '}
                    <span className="muted">
                      ({t.flowId}, {t.period.toLowerCase()})
                    </span>
                  </td>
                  <td>
                    {fmtNum(t.qty)} × {fmtNum(t.factor)} × {t.count}
                    {t.adjust !== undefined ? ` × ${t.adjust.toFixed(3)} (placement)` : ''}
                    {t.needFactor !== undefined && t.needFactor !== 1 ? ` × ${fmtNum(t.needFactor)}` : ''}
                  </td>
                  <td>{fmtNum(t.value)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {e.terms.length > 14 && <div className="muted">…and {e.terms.length - 14} more flows</div>}
      {e.refs && Object.keys(e.refs).length > 0 && (
        <dl className="why-refs">
          {Object.entries(e.refs).map(([k, v]) => (
            <div key={k}>
              <dt>{sys(k)?.name ?? k}</dt>
              <dd>{fmtNum(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {e.assumptions && e.assumptions.length > 0 && (
        <div className="why-assumptions">
          <div className="muted">Site values used ({site.name}):</div>
          <ul>
            {e.assumptions.map((k) => (
              <li key={k} data-testid={`why-assumption-${k}`}>
                {ASSUMPTION_LABEL[k] ?? k}: <strong>{fmtNum(site.assumptions[k])}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
      {e.notes && e.notes.length > 0 && (
        <ul className="why-notes">
          {e.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {confidences.length > 0 && <div className="muted">Catalog confidence: {confidences.join(', ')}</div>}
    </div>
  );
}
