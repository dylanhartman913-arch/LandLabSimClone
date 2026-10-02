import { useMemo, useState } from 'react';
import { marketView, weeklyBills, type MarketRow } from '@homestead/engine';
import { fmtMoney, fmtNum, fmtPct } from '../lib/format.ts';
import { sparkPoints } from '../lib/sparkline.ts';
import { useGame } from '../store/game.ts';
import { WhyNum } from './Why.tsx';

/** Weekly bills, buying from the market, and standing orders (G12). */
export function Market() {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const st = useGame.getState();
  const bills = useMemo(() => weeklyBills(game, catalog), [game, catalog]);
  const rows = useMemo(() => marketView(game, catalog), [game, catalog]);
  const scale = Math.max(1, ...bills.weeks);
  return (
    <section className="panel wide" role="dialog" aria-label="Market and bills" data-testid="market">
      <header className="panel-head">
        <h2>Market and bills</h2>
        <button className="btn ghost" onClick={() => st.setPanel(null)} aria-label="Close market">
          ✕
        </button>
      </header>
      <h3>Weekly bills</h3>
      <div className="bills-head">
        <div>
          <div className="hud-sub">This week</div>
          <div className="big-num" data-testid="bills-week">
            <WhyNum value={bills.thisWeek} title="Bills this week" format={fmtMoney} />
          </div>
          {bills.trend !== null && (
            <div className={bills.trend <= 0 ? 'good-text' : 'warn-text'} data-testid="bills-trend">
              {bills.trend <= 0 ? '▼' : '▲'} {fmtPct(Math.abs(bills.trend))} since {bills.weeks.length} weeks ago
            </div>
          )}
        </div>
        <svg width="220" height="44" role="img" aria-label={`Bills per week, last ${bills.weeks.length} weeks`}>
          <polyline points={sparkPoints(bills.weeks.map((w) => w / scale), 220, 40)} className="spark-line" />
        </svg>
      </div>
      {bills.lines.length === 0 ? (
        <p className="empty">Nothing bought yet. Backstops (grocery, grid, city water) and market orders show up here.</p>
      ) : (
        <table className="flows-table" data-testid="bills-lines">
          <thead>
            <tr>
              <th scope="col">What</th>
              <th scope="col">From</th>
              <th scope="col">This week</th>
              <th scope="col">Last 12 weeks</th>
            </tr>
          </thead>
          <tbody>
            {bills.lines.map((l) => (
              <tr key={`${l.kind}|${l.item}`}>
                <td>{l.item}</td>
                <td className="muted">{l.kind === 'backstop' ? 'utility / store' : l.kind === 'market' ? 'market' : l.kind === 'fees' ? 'connections' : 'delivery'}</td>
                <td className="num">
                  <WhyNum value={l.thisWeek} title={`${l.item} this week`} format={fmtMoney} />
                </td>
                <td>
                  <svg width="100" height="18" aria-hidden="true">
                    <polyline points={sparkPoints(l.weeks.map((w) => w / scale), 100, 16)} className="spark-line" />
                  </svg>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>Buy</h3>
      <p className="muted small">
        One trip a day covers every order. A trip uses 10 miles of your transport, or costs $25 for delivery if you
        have none. Orders arrive the next morning. Nothing is bought while cash is below zero.
      </p>
      <table className="flows-table market-table" data-testid="market-table">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Price</th>
            <th scope="col">In stock</th>
            <th scope="col">Lasts</th>
            <th scope="col">Buy now</th>
            <th scope="col">Keep above</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <MarketLine key={r.resource} row={r} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function MarketLine({ row }: { row: MarketRow }) {
  const st = useGame.getState();
  const [amount, setAmount] = useState('');
  const [keep, setKeep] = useState(row.standing ? String(row.standing.keepAbove) : '');
  const id = row.resource.replace(/\W+/g, '-');
  return (
    <tr data-testid={`market-${id}`}>
      <th scope="row">{row.resource}</th>
      <td className="num">
        ${row.price < 0.1 ? row.price.toFixed(4) : row.price.toFixed(2)}/{row.unit}
      </td>
      <td className="num">
        <WhyNum value={row.stock} title={`${row.resource} in stock`} unit={row.unit} />
        {row.pending > 0 && <span className="muted"> (+{fmtNum(row.pending)} ordered)</span>}
      </td>
      <td className="num">{row.daysLeft === null ? '—' : `${fmtNum(row.daysLeft)} days`}</td>
      <td>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (st.marketBuy(row.resource, Number(amount))) setAmount('');
          }}
        >
          <input
            type="number"
            min={0}
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label={`Amount of ${row.resource} to buy (${row.unit})`}
            data-testid={`buy-amount-${id}`}
          />
          <button className="btn small" disabled={!(Number(amount) > 0)} data-testid={`buy-${id}`}>
            Buy
          </button>
        </form>
      </td>
      <td>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            st.marketStanding(row.resource, Number(keep) || 0);
          }}
        >
          <input
            type="number"
            min={0}
            step="any"
            value={keep}
            placeholder="off"
            onChange={(e) => setKeep(e.target.value)}
            aria-label={`Keep ${row.resource} above (${row.unit}); empty or 0 turns it off`}
            data-testid={`keep-${id}`}
          />
          <button className="btn small ghost" data-testid={`keep-save-${id}`}>
            {row.standing ? 'Update' : 'Set'}
          </button>
        </form>
      </td>
    </tr>
  );
}
