import type { Catalog } from '@homestead/catalog';
import { explained, type Explained } from '../provenance.ts';
import type { DayLedger, GameState } from '../time/types.ts';

export interface BillLine {
  /** A resource name, a system (running costs), "Connection fees", or "Market delivery". */
  item: string;
  kind: 'backstop' | 'market' | 'fees' | 'delivery' | 'running';
  /** Dollars over the last 7 days. */
  thisWeek: Explained;
  /** Dollars per week for up to the last 12 weeks, oldest first. */
  weeks: number[];
}

export interface WeeklyBills {
  thisWeek: Explained;
  /** Total per week, oldest first (up to 12). */
  weeks: number[];
  /** Change from the first full week shown to this one (−0.2 = bills fell 20%). */
  trend: number | null;
  lines: BillLine[];
}

function weekBlocks(ledgers: readonly DayLedger[], n = 12): DayLedger[][] {
  const recent = ledgers.slice(-7 * n);
  const out: DayLedger[][] = [];
  for (let end = recent.length; end > 0; end -= 7) out.unshift(recent.slice(Math.max(0, end - 7), end));
  return out;
}

/** What the household paid for backstops and market goods, this week and over the last 12 weeks (G12). */
export function weeklyBills(state: GameState, catalog?: Catalog): WeeklyBills {
  const sysName = (id: string) => catalog?.systems.find((x) => x.id === id)?.name ?? id;
  const blocks = weekBlocks(state.ledgers);
  const lines = new Map<string, BillLine & { _w: number[] }>();
  const line = (item: string, kind: BillLine['kind']) => {
    const key = `${kind}|${item}`;
    let l = lines.get(key);
    if (!l) {
      l = { item, kind, thisWeek: explained(0, ''), weeks: [], _w: blocks.map(() => 0) };
      lines.set(key, l);
    }
    return l;
  };
  blocks.forEach((days, w) => {
    for (const d of days) {
      const s = d.spend;
      if (!s) continue;
      for (const [r, v] of Object.entries(s.backstop)) line(r, 'backstop')._w[w]! += v;
      for (const [r, v] of Object.entries(s.market)) line(r, 'market')._w[w]! += v;
      if (s.fees) line('Connection fees', 'fees')._w[w]! += s.fees;
      if (s.delivery) line('Market delivery', 'delivery')._w[w]! += s.delivery;
      for (const [id, v] of Object.entries(s.running ?? {})) line(sysName(id), 'running')._w[w]! += v;
    }
  });
  const weeks = blocks.map((_, w) => [...lines.values()].reduce((a, l) => a + l._w[w]!, 0));
  const out: BillLine[] = [...lines.values()]
    .map(({ _w, ...l }) => ({
      ...l,
      weeks: _w,
      thisWeek: explained(_w.at(-1) ?? 0, `dollars paid for ${l.item} over the last 7 days`, {
        refs: { days: blocks.at(-1)?.length ?? 0 },
      }),
    }))
    .sort((a, b) => b.thisWeek.value - a.thisWeek.value || a.item.localeCompare(b.item));
  const full = blocks.map((b, i) => (b.length === 7 ? i : -1)).filter((i) => i >= 0);
  const first = full[0];
  const last = full.at(-1);
  const trend =
    first !== undefined && last !== undefined && last > first && weeks[first]! > 0
      ? (weeks[last]! - weeks[first]!) / weeks[first]!
      : null;
  return {
    thisWeek: explained(weeks.at(-1) ?? 0, 'Σ backstop deliveries × price + market purchases + connection fees + delivery + running costs (house, cars), last 7 days', {
      refs: Object.fromEntries(out.map((l) => [l.item, l.thisWeek.value])),
    }),
    weeks,
    trend,
    lines: out,
  };
}

export interface MarketRow {
  resource: string;
  unit: string;
  /** Dollars per unit. */
  price: number;
  stock: Explained;
  /** Average daily use over the last week (0 if none). */
  dailyUse: number;
  /** Days the stock lasts at that rate (null when nothing uses it). */
  daysLeft: number | null;
  /** Ordered for the next trip. */
  pending: number;
  standing: { keepAbove: number; orderUpTo: number } | null;
}

/** What the market sells, with stock on hand, how long it lasts, and any orders (G12). */
export function marketView(state: GameState, catalog: Catalog): MarketRow[] {
  const week = state.ledgers.slice(-7);
  return catalog.resources
    .filter((r) => r.marketAvailable && r.marketPrice !== null)
    .map((r) => {
      const stock = state.stocks[r.name] ?? 0;
      const used = week.reduce((a, l) => a + (l.resources[r.name]?.consumed ?? 0), 0);
      const dailyUse = week.length ? used / week.length : 0;
      const so = state.market?.standing.find((s) => s.resource === r.name);
      return {
        resource: r.name,
        unit: r.unit,
        price: r.marketPrice!,
        stock: explained(stock, `${r.name} in stock now`),
        dailyUse,
        daysLeft: dailyUse > 1e-9 ? stock / dailyUse : null,
        pending: (state.market?.orders ?? []).filter((o) => o.resource === r.name).reduce((a, o) => a + o.amount, 0),
        standing: so ? { keepAbove: so.keepAbove, orderUpTo: so.orderUpTo } : null,
      };
    });
}
