import { useMemo, useState } from 'react';
import { nodeOptions, resourcePage } from '@homestead/engine';
import { fmtMoney, fmtNum, fmtPct } from '../lib/format.ts';
import { histogramBars } from '../lib/charts.ts';
import { useGame } from '../store/game.ts';
import { WhyNum } from './Why.tsx';

/** A link that opens a resource's page (G13 click-through). */
export function ResourceLink({ name, className = '' }: { name: string; className?: string }) {
  return (
    <button
      type="button"
      className={`link res-link ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        useGame.getState().openResource(name);
      }}
      data-testid={`res-link-${name}`}
    >
      {name}
    </button>
  );
}

/** Where a resource comes from and where it goes: the resource page (G13). */
export function ResourcePage() {
  const name = useGame((s) => s.resourcePage);
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const canBack = useGame((s) => s.navBack.length > 0);
  const page = useMemo(
    () => (name ? resourcePage(game, catalog, name, nodeOptions(game, name)) : null),
    [name, game, catalog],
  );
  const [amount, setAmount] = useState('');
  if (!name || !page) return null;
  const st = useGame.getState();
  const W = 220;
  const H = 40;
  const totals = page.weeks.produced.map((p, i) => p + (page.weeks.purchased[i] ?? 0));
  const scale = Math.max(1e-9, ...totals, ...page.weeks.consumed);
  const made = histogramBars(page.weeks.produced.map((v) => v / scale), W, H);
  const bought = histogramBars(totals.map((v) => v / scale), W, H);
  const used = histogramBars(page.weeks.consumed.map((v) => v / scale), W, H);
  return (
    <section className="card resource-sheet" role="dialog" aria-label={`${name}: where it comes from`} data-testid="resource-page">
      <header className="card-head">
        {canBack && (
          <button className="btn ghost" onClick={() => st.navigateBack()} aria-label="Back" data-testid="nav-back">
            ←
          </button>
        )}
        <div>
          <h2>{name}</h2>
          <div className="muted small">
            {page.cls} · measured in {page.unit}
            {page.needsRow ? ` · counts toward ${page.needsRow}` : ''}
          </div>
        </div>
        <button className="btn ghost close" onClick={() => st.closeResource()} aria-label="Close">
          ✕
        </button>
      </header>
      {page.note && <p className="card-desc">{page.note}</p>}
      <div className="res-facts">
        {page.stock && (
          <div>
            <span className="muted">In stock</span>{' '}
            <WhyNum value={page.stock} title={`${name} in stock`} unit={page.unit} testId="res-stock" />
          </div>
        )}
        {page.storage && (
          <div>
            <span className="muted">Room in {page.storage.pool}</span> {fmtNum(page.storage.room)} {page.unit}
          </div>
        )}
        {page.spoilPerWeek > 0 && (
          <div>
            <span className="muted">Spoils</span> {fmtPct(page.spoilPerWeek)} a week
          </div>
        )}
      </div>
      {totals.length > 0 && (
        <figure className="res-chart">
          <svg width={W} height={H} role="img" aria-label={`Last ${totals.length} weeks: made, bought, and used`}>
            {bought.map((b, i) => (
              <rect key={`b${i}`} x={b.x} y={b.y} width={b.w} height={b.h} className="bar-bought" />
            ))}
            {made.map((b, i) => (
              <rect key={`m${i}`} x={b.x} y={b.y} width={b.w} height={b.h} className="bar-made" />
            ))}
            <polyline
              points={used.map((b) => `${b.x + b.w / 2},${b.y}`).join(' ')}
              className="spark-line"
            />
          </svg>
          <figcaption className="muted small">
            Last {totals.length} weeks: <span className="key made">made here</span>{' '}
            <span className="key bought">bought</span> <span className="key used">used</span>
          </figcaption>
        </figure>
      )}

      <h3>Where it comes from</h3>
      <h4>In your design</h4>
      {page.inDesign.length === 0 ? (
        <p className="muted small">Nothing you have makes {name}.</p>
      ) : (
        <ul className="res-list" data-testid="res-in-design">
          {page.inDesign.map((p) => (
            <li key={p.systemId}>
              <button className="link" onClick={() => st.openCard(p.systemId)}>
                {p.name}
              </button>
              {p.count !== 1 ? ` ×${fmtNum(p.count)}` : ''}: {fmtNum(p.actualWeek)} {page.unit}/wk
              {p.headroomWeek > 1e-6 && (
                <span className="muted">
                  {' '}
                  (could make {fmtNum(p.potentialWeek)}; short of{' '}
                  {p.limitedBy ? <ResourceLink name={p.limitedBy} /> : 'an input'})
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <h4>On your land</h4>
      {page.onLand.length === 0 ? (
        <p className="muted small">Nothing on this land yields {name}.</p>
      ) : (
        <ul className="res-list" data-testid="res-on-land">
          {page.onLand.map((n) => (
            <li key={n.id}>
              <button className="link" onClick={() => st.focusNode(n.id)}>
                {n.type}
              </button>{' '}
              {fmtNum(n.distanceFt)} ft away: {fmtNum(n.yieldPerHour)} {page.unit} per hour of work,{' '}
              {fmtNum(n.stock)} {page.unit} there now
            </li>
          ))}
        </ul>
      )}
      <h4>You could build</h4>
      <ul className="res-list" data-testid="res-could-build">
        {page.couldBuild.slice(0, 6).map((o) => (
          <li key={o.systemId}>
            <button className="link" onClick={() => st.openCard(o.systemId)} data-testid={`build-option-${o.systemId}`}>
              {o.name}
            </button>{' '}
            <span className="muted">
              {fmtMoney(o.cost)} {o.mode === 'diy' ? 'DIY' : 'to buy'}, {fmtNum(o.weeklyOutput)} {page.unit}/wk
              {o.conventional ? ' · a store or utility' : ''}
            </span>
            {o.inputs.length > 0 && (
              <div className="needs-chips">
                needs{' '}
                {o.inputs.map((i) => (
                  <span key={i.resource} className={`chip ${i.have ? 'have' : 'missing'}`}>
                    <span aria-hidden="true">{i.have ? '✓' : '✗'}</span> <ResourceLink name={i.resource} />
                    <span className="sr-only">{i.have ? ' (you have this)' : ' (you have none)'}</span>
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
        {page.couldBuild.length === 0 && <li className="muted small">No system in the catalog makes {name}.</li>}
      </ul>
      <h4>Buy</h4>
      {page.buy ? (
        <form
          className="inline-form"
          data-testid="res-buy"
          onSubmit={(e) => {
            e.preventDefault();
            if (st.marketBuy(name, Number(amount))) setAmount('');
          }}
        >
          <span>
            ${page.buy.price < 0.1 ? page.buy.price.toFixed(4) : page.buy.price.toFixed(2)} per {page.buy.unit} at the
            market
          </span>
          <input
            type="number"
            min={0}
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label={`Amount of ${name} to buy (${page.unit})`}
          />
          <button className="btn small" disabled={!(Number(amount) > 0)}>
            Buy
          </button>
        </form>
      ) : (
        <p className="muted small">
          The market doesn't sell {name}
          {name === 'Electricity' ? ': it comes only through a grid connection.' : '.'}
        </p>
      )}

      <h3>Where it goes</h3>
      {page.usedBy.length === 0 ? (
        <p className="muted small">Nothing in your design uses {name}.</p>
      ) : (
        <ul className="res-list" data-testid="res-used-by">
          {page.usedBy.map((u) => (
            <li key={u.systemId}>
              <button className="link" onClick={() => st.openCard(u.systemId)}>
                {u.name}
              </button>
              {u.count !== 1 ? ` ×${fmtNum(u.count)}` : ''}: gets {fmtNum(u.receivedWeek)} of {fmtNum(u.requestedWeek)}{' '}
              {page.unit}/wk
            </li>
          ))}
        </ul>
      )}
      {page.catalogUsers.length > 0 && (
        <details>
          <summary>
            {page.catalogUsers.length} system{page.catalogUsers.length === 1 ? '' : 's'} in the catalog use {name}
          </summary>
          <ul className="res-list">
            {page.catalogUsers.map((u) => (
              <li key={u.systemId}>
                <button className="link" onClick={() => st.openCard(u.systemId)}>
                  {u.name}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="muted small">{page.disposal}</p>
    </section>
  );
}
