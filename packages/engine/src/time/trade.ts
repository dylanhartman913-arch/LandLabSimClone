import { requestAccess } from './access.ts';
import { explained } from '../provenance.ts';
import { getQuestLine, type Catalog, type NeedKey } from '@homestead/catalog';
import type { AccessDay, GameEvent, DayLedger, DaySpend, GameState, ResourceDay, NeedDay } from './types.ts';

export function ruthTrades(state: GameState): boolean {
  const t = state.tutorial;
  return !!t && t.current >= getQuestLine(t.line).quests.length;
}

function tradable(catalog: Catalog, resource: string) {
  const r = catalog.resources.find((r) => r.name === resource);
  if (!r || r.class !== 'Flow' || !r.storable || !(r.marketPrice! > 0))
    throw new Error(`${resource} has no storable, priced market trade`);
  return r;
}

export function queueTrade(
  catalog: Catalog,
  state: GameState,
  resource: string,
  amount: number,
  keep = 0,
  receive?: string,
): GameState {
  if (!state.settings.sellingAndTrade) throw new Error('Selling and trade is disabled');
  if (resource === 'Labor') {
    if (!catalog.incomeTrade) throw new Error('Labor has no barter rule');
    if (!receive) throw new Error('Labor has no cash trade; barter it with Ruth for goods');
  } else tradable(catalog, resource);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(keep) || keep < 0)
    throw new Error('Trade a finite positive amount and keep a nonnegative reserve');
  if (receive) {
    if (!ruthTrades(state)) throw new Error('Finish the tutorial before bartering with Ruth');
    if (!tradable(catalog, receive).marketAvailable) throw new Error('Ruth cannot supply that resource');
    if (receive === resource) throw new Error('Choose a different resource to receive');
  }
  const market = state.market ?? { orders: [], standing: [] };
  return {
    ...state,
    market: {
      ...market,
      sales: [...(market.sales ?? []), { resource, amount, keep, ...(receive ? { receive } : {}) }],
    },
  };
}

interface TradeDay {
  prev: GameState;
  access?: AccessDay;
  events: GameEvent[];
  market: GameState['market'];
  stocks: Record<string, number>;
  produced: Record<string, number>;
  res: Record<string, ResourceDay>;
  bought: Record<string, number>;
  needs: Record<NeedKey, NeedDay>;
  cash: number;
  cashIn: number;
  pool: number;
  constructionUsed: number;
  gatherUsed: number;
  laborUsed: number;
  upkeepRequested: number;
  laborBySystem: Record<string, number>;
  spend: DaySpend;
}

/**
 * LL-46: Ruth takes spare household labor (after upkeep, gathering and construction) for goods at a
 * fixed value per hour. At least half an hour must be free; the rest of the order waits.
 */
function barterLabor(
  d: TradeDay,
  catalog: Catalog,
  order: { amount: number; receive?: string },
): { receipt: NonNullable<DayLedger['trades']>[number]; left: number } | null {
  const idle = Math.max(0, d.pool - d.constructionUsed - d.gatherUsed - d.laborUsed);
  if (idle < 0.5 || !order.receive) return null;
  const hours = Math.min(order.amount, idle);
  const target = tradable(catalog, order.receive);
  const receivedAmount = (hours * catalog.incomeTrade!.laborBarterValuePerHour) / target.marketPrice!;
  d.laborUsed += hours;
  d.upkeepRequested += hours;
  d.res.Labor!.consumed += hours;
  d.laborBySystem['Neighbor work'] = (d.laborBySystem['Neighbor work'] ?? 0) + hours;
  d.stocks[target.name] = (d.stocks[target.name] ?? 0) + receivedAmount;
  d.res[target.name]!.purchased += receivedAmount;
  d.bought[target.name] = (d.bought[target.name] ?? 0) + receivedAmount;
  if (target.needsRow) {
    const n = d.needs[target.needsRow];
    const provided = receivedAmount * (target.factorToNeed ?? 1);
    n.provided += provided;
    n.potential += provided;
    n.bought += provided;
  }
  return { receipt: { resource: 'Labor', amount: hours, revenue: 0, received: target.name, receivedAmount }, left: order.amount - hours };
}

/** Sell after household consumption, before spoilage. Unfilled orders wait; reserves are never sold. */
export function settleTrades(d: TradeDay, catalog: Catalog): NonNullable<DayLedger['trades']> {
  const sales = d.market?.sales;
  if (!d.prev.settings.sellingAndTrade || !sales?.length) return [];
  const results: NonNullable<DayLedger['trades']> = [];
  const pending: typeof sales = [];
  const stand = d.prev.instances.find(
    (i) => i.status === 'active' && catalog.systems.find((s) => s.id === i.systemId)?.name === 'Farm Stand',
  );
  // Yesterday's realized operation proves the stand's labor and transport inputs were met.
  const premium =
    stand &&
    (!d.prev.settings.wearAndRepair || (stand.condition ?? 1) >= 0.3) &&
    Object.entries(d.prev.lastDay).some(([k, g]) => k.startsWith(`${stand.systemId}|`) && g.sat >= 0.99);
  let tripPaid = false;
  for (const order of sales) {
    if (order.resource === 'Labor') {
      const result = barterLabor(d, catalog, order);
      if (result) results.push(result.receipt);
      if (!result || result.left > 1e-9) pending.push(result ? { ...order, amount: result.left } : order);
      continue;
    }
    const r = tradable(catalog, order.resource);
    const available = Math.max(0, (d.stocks[r.name] ?? 0) + (d.produced[r.name] ?? 0) - order.keep);
    const idle = Math.max(0, d.pool - d.constructionUsed - d.gatherUsed - d.laborUsed);
    if (
      available <= 0 ||
      idle < 0.5 ||
      (!d.access && !order.receive && !tripPaid && (d.stocks.Transportation ?? 0) < 10 && d.cash < 25)
    ) {
      pending.push(order);
      continue;
    }
    if (d.access && !order.receive && !requestAccess(d, catalog, { key: 'market', purpose: 'market', miles: catalog.transportAccess!.marketMiles, fare: catalog.transportAccess!.deliveryFare })) {
      pending.push(order);
      continue;
    }
    const amount = Math.min(order.amount, available);
    d.laborUsed += 0.5;
    d.upkeepRequested += 0.5;
    d.laborBySystem[stand?.systemId ?? 'Market work'] =
      (d.laborBySystem[stand?.systemId ?? 'Market work'] ?? 0) + 0.5;
    if (!d.access && !order.receive && !tripPaid) {
      if ((d.stocks.Transportation ?? 0) >= 10) {
        d.stocks.Transportation! -= 10;
        d.res.Transportation!.consumed += 10;
      } else {
        d.cash -= 25;
        d.spend.delivery += 25;
      }
      tripPaid = true;
    }
    const stockUsed = Math.min(d.stocks[r.name] ?? 0, amount);
    d.stocks[r.name] = (d.stocks[r.name] ?? 0) - stockUsed;
    d.produced[r.name] = (d.produced[r.name] ?? 0) - (amount - stockUsed);
    d.res[r.name]!.produced += amount - stockUsed;
    d.res[r.name]!.sold = (d.res[r.name]!.sold ?? 0) + amount;
    const value = amount * r.marketPrice! * (order.receive ? 0.7 : premium ? 0.8 : 0.5);
    if (order.receive) {
      const target = tradable(catalog, order.receive);
      const receivedAmount = value / target.marketPrice!;
      d.stocks[target.name] = (d.stocks[target.name] ?? 0) + receivedAmount;
      d.res[target.name]!.purchased += receivedAmount;
      d.bought[target.name] = (d.bought[target.name] ?? 0) + receivedAmount;
      if (target.needsRow) {
        const n = d.needs[target.needsRow];
        const provided = receivedAmount * (target.factorToNeed ?? 1);
        n.provided += provided;
        n.potential += provided;
        n.bought += provided;
      }
      results.push({ resource: r.name, amount, revenue: 0, received: target.name, receivedAmount });
    } else {
      d.cashIn += value;
      results.push({ resource: r.name, amount, revenue: value });
    }
    if (amount < order.amount) pending.push({ ...order, amount: order.amount - amount });
  }
  d.market = { ...d.market!, sales: pending };
  return results;
}

/** LL-46 card model for a CSA: its terms and yesterday's boxes. */
export function csaView(state: GameState, catalog: Catalog, id: string) {
  const rule = catalog.incomeTrade;
  const inst = state.instances.find((i) => i.id === id);
  if (!rule || !inst || inst.systemId !== rule.csaId) return null;
  const last = state.ledgers.at(-1)?.csa?.find((c) => c.instanceIds.includes(id)) ?? null;
  return {
    text: state.settings.sellingAndTrade
      ? `Members prepay for a weekly box through the growing season. A short week refunds the missing share and pays ${Math.round(rule.makeGoodFactor * 100)}% of it again as a make-good.`
      : 'Enable Selling and trade to run a CSA.',
    share: last ? explained(last.share, 'share of yesterday’s promised boxes packed: produce and packing labor met') : null,
    revenue: last ? explained(last.revenue, 'CSA income earned yesterday') : null,
    makeGood: last ? explained(last.makeGood, `make-good paid yesterday: missing revenue × ${rule.makeGoodFactor}`) : null,
  };
}
