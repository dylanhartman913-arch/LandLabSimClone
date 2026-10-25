import { useState } from 'react';
import { financeView } from '@homestead/engine';
import { useGame } from '../store/game.ts';
import { fmtDays, fmtMoney, fmtPct } from '../lib/format.ts';
import { WhyNum } from './Why.tsx';

export function Finance() {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const view = financeView(game, catalog);
  const [amount, setAmount] = useState('1000');
  const [error, setError] = useState('');
  if (!view) return null;
  const act = (operation: 'borrow' | 'repay' | 'insurance' | 'reserve', amount: number) => {
    try {
      useGame.getState().phase9Action({ kind: 'finance', operation, amount });
      setError('');
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      setError(error.message);
    }
  };
  return (
    <div data-testid="finance-controls">
      <h3>Finance</h3>
      <p>
        Credit owed: <WhyNum value={view.debt} title="Credit owed" format={fmtMoney} />. Available to borrow:{' '}
        <WhyNum value={view.available} title="Available credit" format={fmtMoney} /> of{' '}
        <WhyNum value={view.limit} title="Credit limit" format={fmtMoney} /> at{' '}
        <WhyNum value={view.apr} title="Annual interest" format={fmtPct} /> annual interest.
      </p>
      <p className="small muted">
        Borrow explicitly before spending. Interest is paid daily; unpaid interest adds to debt, even above
        the borrowing limit. Repayments reduce debt immediately. These are experimental game balance rates.
      </p>
      <div className="inline-form">
        <label>
          Credit amount ($)
          <input
            aria-label="Credit amount"
            type="number"
            min="0.01"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <button className="btn small" onClick={() => act('borrow', Number(amount))}>
          Borrow
        </button>
        <button className="btn small" onClick={() => act('repay', Number(amount))}>
          Repay
        </button>
      </div>
      <p>
        Property tax: <WhyNum value={view.taxPerYear} title="Annual property tax" format={fmtMoney} /> per
        year, assessed and paid daily. Unpaid tax:{' '}
        <WhyNum value={view.taxDue} title="Unpaid property tax" format={fmtMoney} />.
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={view.insured}
          onChange={(e) => act('insurance', e.target.checked ? 1 : 0)}
        />
        Equipment failure insurance
      </label>
      <p className="small">
        Premium: <WhyNum value={view.insurancePerYear} title="Annual insurance premium" format={fmtMoney} />{' '}
        per year. Pays <WhyNum value={view.coverage} title="Insurance share" format={fmtPct} /> of replacement
        value above a <WhyNum value={view.deductible} title="Insurance deductible" format={fmtMoney} />{' '}
        deductible per newly failed asset. Requires Wear, repair and replacement. Excludes routine
        maintenance, livestock and removal. Coverage applies only on days the premium can be paid in full.{' '}
        {view.insured &&
          (view.covered ? 'Covered on the last measured day.' : 'No paid coverage on the last measured day.')}
      </p>
      <p className="small">
        Last 28 measured days: insurance payouts{' '}
        <WhyNum value={view.claims} title="Insurance payouts" format={fmtMoney} />; unpaid interest added to
        debt <WhyNum value={view.capitalized} title="Capitalized interest" format={fmtMoney} />.
      </p>
      <label>
        Emergency reserve (days)
        <input
          aria-label="Emergency reserve days"
          type="number"
          min="1"
          max="365"
          value={view.emergencyDays}
          onChange={(e) => act('reserve', Number(e.target.value))}
        />
      </label>
      <p>
        Reserve target: <WhyNum value={view.target} title="Emergency fund target" format={fmtMoney} />. Cash
        shortfall including unpaid tax:{' '}
        <WhyNum value={view.shortfall} title="Emergency fund shortfall" format={fmtMoney} />. Cash runway:{' '}
        {view.runwayDays === null
          ? 'measuring (needs 7 days)'
          : Number.isFinite(view.runwayDays)
            ? fmtDays(view.runwayDays)
            : 'no net cash burn measured'}
        .
      </p>
      <p className="small muted">
        Runway and reserve use net operating spending, excluding borrowing, repayments and insurance payouts.
        Credit is not a reserve. With no positive net spending, the target is zero; this does not predict
        future seasonal bills. Turning Finance off pauses its bills and keeps debt and unpaid tax saved.
      </p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
