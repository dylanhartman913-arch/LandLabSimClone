import { Finance } from './Finance.tsx';
import { useMemo, useState } from 'react';
import { accessView, marketView, weeklyBills, ruthTrades, type MarketRow } from '@homestead/engine';
import { fmtDays, fmtMoney, fmtNum, fmtPct } from '../lib/format.ts';
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
  const access = accessView(game);
  return (
    <section className="panel wide" role="dialog" aria-label="Market and bills" data-testid="market">
      <header className="panel-head">
        <h2>Market and bills</h2>
        <button className="btn ghost" onClick={() => st.setPanel(null)} aria-label="Close market">
          ✕
        </button>
      </header>
      {game.settings.finance && <Finance />}
      {access && <div data-testid="transport-access">
        <h3>Transportation access</h3>
        <p>{access.detail}</p>
        <p>Last 7 measured days: <WhyNum value={access.completed} title="Completed trips" /> completed; <WhyNum value={access.blocked} title="Blocked trips" /> blocked. Own mileage used: <WhyNum value={access.ownMiles} title="Own mileage used" unit="miles" />. Travel paid: <WhyNum value={access.paid} title="Travel paid" format={fmtMoney} />. Emergency fares payable: <WhyNum value={access.fareDue} title="Emergency fares payable" format={fmtMoney} />.</p>
      </div>}
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
      {bills.deliveryShare && bills.deliveryShare.value >= 0.25 && (
        <p className="warn-text small" data-testid="delivery-share">
          Delivery charges are <WhyNum value={bills.deliveryShare} title="Delivery share of market spending" format={fmtPct} /> of what
          you spend at the market. Each trip without your own transport costs $25: order less often in bigger amounts
          (raise standing orders' top-up levels), or add transport so trips cost miles instead.
        </p>
      )}
      {bills.lines.length === 0 ? (
        <p className="empty">Nothing bought yet. Backstops (grocery, grid, city water) and market orders show up here.</p>
      ) : (
        <table className="flows-table" data-testid="bills-lines">
          <caption>Bills over the last 7 measured days; trend by week.</caption>
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
                <td className="muted">{l.kind === 'backstop' ? 'utility / store' : l.kind === 'market' ? 'market' : l.kind === 'fees' ? 'connections' : l.kind === 'finance' ? 'finance' : l.kind === 'access' ? 'travel' : 'delivery'}</td>
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
      {game.settings.wearAndRepair && <p>Expected replacement allowance: <WhyNum value={bills.replacementPerYear} title="Annual replacement allowance" format={fmtMoney} /> per year (planning only).</p>}
      {game.settings.sellingAndTrade && <TradeControls />}
      <h3>Buy</h3>
      {game.settings.cashFloor && <p className="small muted">Purchases and connection fees stop when cash cannot cover them. Unfunded hookups stop delivering; queued deliveries wait for funds.</p>}
      <p className="muted small">
        One trip a day covers every order. A trip uses 10 miles of your transport, or costs $25 for delivery if you
        have none. Orders arrive the next morning. Nothing is bought while cash is below zero.
      </p>
      <table className="flows-table market-table" data-testid="market-table">
          <caption>Stock now; use and production over the last 7 measured days; prices per unit.</caption>
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
      <td className="num">{row.daysLeft === null ? '—' : fmtDays(row.daysLeft)}</td>
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

function TradeControls() {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const goods = catalog.resources.filter((r) => r.class === 'Flow' && r.storable && (r.marketPrice ?? 0) > 0);
  const [resource, setResource] = useState(goods[0]?.name ?? '');
  const [amount, setAmount] = useState('1');
  const [keep, setKeep] = useState('0');
  const [receive, setReceive] = useState('');
  const [error, setError] = useState('');
  const laborBarter = ruthTrades(game) && catalog.incomeTrade ? catalog.incomeTrade.laborBarterValuePerHour : null;
  return <div data-testid="trade-controls">
    <h3>Sell surplus or barter</h3>
    <p className="small muted">Orders run after household use and before spoilage. The reserve stays home. Selling pays 50% of the reference retail price, or 80% with an operating Farm Stand. Each order needs half an hour of spare labor; selling uses a 10-mile trip or $25 collection. Ruth trades at 70% without a trip once any active tutorial is completed or skipped.{laborBarter !== null && ` She also takes spare work: each hour buys ${fmtMoney(laborBarter)} of goods.`}</p>
    <form className="form" onSubmit={(e) => {
      e.preventDefault();
      try {
        useGame.getState().phase9Action({ kind: 'sell', resource, amount: Number(amount), keep: Number(keep), ...(receive ? { receive } : {}) });
        setError('');
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        setError(error.message);
      }
    }}>
      <label>Give<select aria-label="Give" value={resource} onChange={(e) => setResource(e.target.value)}>{goods.map((r) => <option key={r.name} value={r.name}>{r.name} ({r.unit})</option>)}{laborBarter && <option value="Labor">Labor (hours of spare work for Ruth)</option>}</select></label>
      <label>Amount<input type="number" min="0.001" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label>Keep at least<input type="number" min="0" step="any" value={keep} onChange={(e) => setKeep(e.target.value)} /></label>
      <label>Receive<select aria-label="Receive" value={receive} onChange={(e) => setReceive(e.target.value)}><option value="">Cash</option>{ruthTrades(game) && goods.filter((r) => r.marketAvailable && r.name !== resource).map((r) => <option key={r.name} value={r.name}>{r.name} ({r.unit})</option>)}</select></label>
      <button className="btn" type="submit">Queue trade</button>
      {error && <p role="alert">{error}</p>}
    </form>
    <ul>{game.market?.sales?.map((o, i) => <li key={i}>{fmtNum(o.amount)} {o.resource} for {o.receive ?? 'cash'}; keep {fmtNum(o.keep)}</li>)}</ul>
    <ul>{game.ledgers.at(-1)?.trades?.map((t, i) => <li key={i}>Traded {fmtNum(t.amount)} {t.resource}: {t.received ? `${fmtNum(t.receivedAmount ?? 0)} ${t.received}` : fmtMoney(t.revenue)}</li>)}</ul>
  </div>;
}
