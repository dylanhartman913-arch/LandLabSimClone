import type { Catalog } from '@homestead/catalog';
import { explained } from '../provenance.ts';
import { cashRunway } from '../views/recovery.ts';
import { wearsOut } from './maintenance.ts';
import type { FinanceDay, FinanceState, GameState, Instance, MortgageState } from './types.ts';

/** LL-37: absent state initializes lazily, so legacy snapshots remain byte-for-byte compatible. */
function account(catalog: Catalog, state: GameState): FinanceState {
  if (!catalog.finance) throw new Error('Finance rules are missing from the catalog');
  return (
    state.finance ?? { debt: 0, taxDue: 0, insured: false, emergencyDays: catalog.finance.emergencyDays }
  );
}

/** LL-51: the level monthly payment that repays `principal` over `years` at `annualRate`. */
export function mortgagePayment(principal: number, annualRate: number, years: number): number {
  const r = annualRate / 12;
  const n = years * 12;
  return r === 0 ? principal / n : (principal * r) / (1 - (1 + r) ** -n);
}

export function newMortgage(m: { principal: number; annualRate: number; years: number }): MortgageState {
  return { balance: m.principal, annualRate: m.annualRate, payment: mortgagePayment(m.principal, m.annualRate, m.years), arrears: 0 };
}

/** Convert an existing legacy cash deficit into labeled opening debt when opting in. */
export function activateFinance(catalog: Catalog, state: GameState): GameState {
  const f = { ...account(catalog, state) };
  const deficit = Math.max(0, -state.cash);
  return {
    ...state,
    cash: state.cash + deficit,
    finance: { ...f, debt: f.debt + deficit },
    pendingCash:
      deficit > 0
        ? { ...state.pendingCash, borrowed: (state.pendingCash.borrowed ?? 0) + deficit }
        : state.pendingCash,
  };
}

export function manageFinance(
  catalog: Catalog,
  state: GameState,
  operation: 'borrow' | 'repay' | 'insurance' | 'reserve',
  amount: number,
): GameState {
  if (!state.settings.finance) throw new Error('Finance is disabled');
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Enter a finite, non-negative amount');
  const f = { ...account(catalog, state) };
  const pendingCash = { ...state.pendingCash };
  let cash = state.cash;
  switch (operation) {
    case 'borrow':
      if (amount <= 0 || amount > Math.max(0, catalog.finance!.creditLimit - f.debt))
        throw new Error('Borrowing must be positive and within the remaining credit limit');
      f.debt += amount;
      cash += amount;
      pendingCash.borrowed = (pendingCash.borrowed ?? 0) + amount;
      break;
    case 'repay':
      if (amount <= 0 || amount > f.debt || amount > Math.max(0, cash))
        throw new Error('Repayment must be positive and covered by cash and outstanding debt');
      f.debt -= amount;
      cash -= amount;
      pendingCash.repaid = (pendingCash.repaid ?? 0) + amount;
      break;
    case 'insurance':
      if (amount !== 0 && amount !== 1) throw new Error('Insurance must be on or off');
      f.insured = amount === 1;
      break;
    case 'reserve':
      if (!Number.isInteger(amount) || amount < 1 || amount > 365)
        throw new Error('Reserve target must be 1–365 whole days');
      f.emergencyDays = amount;
      break;
  }
  return { ...state, cash, finance: f, pendingCash };
}

/** End-of-day settlement: daily tax assessment, interest, optional premium, then failure claims.
 * Unpaid interest becomes labeled debt (even above the draw limit); unpaid tax stays payable.
 * Insurance covers only assets that cross from positive condition to zero today under LL-28.
 */
export function advanceFinance(catalog: Catalog, prev: GameState, cash: number, instances: Instance[]) {
  if (!prev.settings.finance) return null;
  const state = { ...account(catalog, prev) };
  const rule = catalog.finance!;
  const pay = (due: number) => {
    const paid = Math.min(Math.max(0, cash), due);
    cash -= paid;
    return paid;
  };
  const interest = (state.debt * rule.annualInterest) / 365;
  const capitalized = interest - pay(interest);
  state.debt += capitalized;
  // LL-51: the mortgage accrues daily; the monthly payment is billed in daily twelfths of a year, arrears first.
  let mortgage: FinanceDay['mortgage'];
  if (state.mortgage) {
    const m = { ...state.mortgage };
    const accrued = (m.balance * m.annualRate) / 365;
    m.balance += accrued;
    const due = Math.min(m.balance, m.arrears + (m.payment * 12) / 365);
    const paid = pay(due);
    m.arrears = due - paid;
    m.balance -= paid;
    state.mortgage = m;
    mortgage = { interest: accrued, paid, balance: m.balance, arrears: m.arrears };
  }
  const taxAssessed = (prev.settings.parcelAcres * rule.landValuePerAcre * rule.propertyTaxRate) / 365;
  state.taxDue += taxAssessed;
  const taxPaid = pay(state.taxDue);
  state.taxDue = Math.max(0, state.taxDue - taxPaid);
  const dailyPremium = rule.insurancePerYear / 365;
  const covered = state.insured && cash >= dailyPremium;
  const premium = covered ? pay(dailyPremium) : 0;
  let claim = 0;
  if (covered && prev.settings.wearAndRepair) {
    for (const inst of instances) {
      if (inst.status !== 'active' || inst.condition !== 0) continue;
      const before = prev.instances.find((i) => i.id === inst.id);
      const sys = catalog.systems.find((s) => s.id === inst.systemId);
      if (!before || (before.condition ?? 1) <= 0 || !sys || !wearsOut(sys)) continue;
      claim += Math.max(0, sys.costBuy * (inst.scale ?? 1) - rule.deductible) * rule.coverage;
    }
  }
  cash += claim;
  const record: FinanceDay = {
    borrowed: prev.pendingCash.borrowed ?? 0,
    repaid: prev.pendingCash.repaid ?? 0,
    interest,
    capitalized,
    taxAssessed,
    taxPaid,
    premium,
    claim,
    covered,
    debt: state.debt,
    taxDue: state.taxDue,
    ...(mortgage ? { mortgage } : {}),
  };
  return { state, cash, record };
}

export function financeView(state: GameState, catalog: Catalog) {
  if (!state.settings.finance) return null;
  const f = account(catalog, state);
  const r = catalog.finance!;
  const runway = cashRunway(state, catalog);
  const scheduled =
    (f.debt * r.annualInterest) / 365 +
    (state.settings.parcelAcres * r.landValuePerAcre * r.propertyTaxRate) / 365 +
    (f.insured ? r.insurancePerYear / 365 : 0) +
    (f.mortgage ? (f.mortgage.payment * 12) / 365 : 0);
  const burn = state.ledgers.length >= 7 ? Math.max(0, runway.burn) : scheduled;
  const target = burn * f.emergencyDays;
  return {
    claims: explained(
      state.ledgers.slice(-28).reduce((a, l) => a + (l.finance?.claim ?? 0), 0),
      'insurance payouts for newly failed equipment over the last 28 measured days',
    ),
    capitalized: explained(
      state.ledgers.slice(-28).reduce((a, l) => a + (l.finance?.capitalized ?? 0), 0),
      'unpaid interest added to debt over the last 28 measured days',
    ),
    debt: explained(f.debt, 'drawn credit plus unpaid interest, less repayments'),
    available: explained(
      Math.max(0, r.creditLimit - f.debt),
      'credit limit less outstanding debt; never counted as cash',
    ),
    limit: explained(r.creditLimit, 'experimental catalog credit limit'),
    apr: explained(r.annualInterest, 'experimental annual interest; assessed daily on outstanding debt'),
    interestPerDay: explained((f.debt * r.annualInterest) / 365, 'debt × annual interest ÷ 365'),
    taxPerYear: explained(
      state.settings.parcelAcres * r.landValuePerAcre * r.propertyTaxRate,
      'parcel acres × assessed value per acre × property tax rate',
      {
        refs: {
          acres: state.settings.parcelAcres,
          valuePerAcre: r.landValuePerAcre,
          rate: r.propertyTaxRate,
        },
      },
    ),
    taxDue: explained(f.taxDue, 'assessed property tax not yet paid; no negative cash'),
    insurancePerYear: explained(
      r.insurancePerYear,
      'optional failure insurance annual premium, billed daily',
    ),
    deductible: explained(r.deductible, 'deductible per newly failed asset'),
    coverage: explained(
      r.coverage,
      'share of replacement value above the deductible paid when equipment newly fails',
    ),
    insured: f.insured,
    covered: state.ledgers.at(-1)?.finance?.covered ?? false,
    emergencyDays: f.emergencyDays,
    target: explained(
      target,
      'reserve days × positive daily net spending over the last 28 days; scheduled finance costs until 7 days measured',
      { refs: { days: f.emergencyDays, dailyBurn: burn } },
    ),
    shortfall: explained(
      Math.max(0, target + f.taxDue - Math.max(0, state.cash)),
      'reserve target plus unpaid tax less cash; credit excluded',
    ),
    runwayDays: state.ledgers.length >= 7 ? runway.days : null,
    mortgage: f.mortgage
      ? {
          balance: explained(f.mortgage.balance, 'principal plus accrued interest, less payments'),
          payment: explained(f.mortgage.payment, 'level monthly payment that repays the start’s principal over its term', {
            refs: { annualRate: f.mortgage.annualRate },
          }),
          arrears: explained(f.mortgage.arrears, 'installments billed but not yet paid; paid first from later cash, no penalty'),
          annualRate: f.mortgage.annualRate,
        }
      : null,
  };
}
