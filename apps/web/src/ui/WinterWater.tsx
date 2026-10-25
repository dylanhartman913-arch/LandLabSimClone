import { useState } from 'react';
import { winterView, type ActionBody } from '@homestead/engine';
import { useGame } from '../store/game.ts';
import { WhyNum } from './Why.tsx';
import { fmtMoney, fmtNum } from '../lib/format.ts';

/** LL-33: an outdoor tank's frost, ice and winter protection. */
export function WinterWater({ id }: { id: string }) {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const v = winterView(game, catalog, id);
  const [error, setError] = useState('');
  const act = (body: Extract<ActionBody, { kind: 'winterize' }>) => {
    try {
      useGame.getState().phase9Action(body);
      setError('');
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      setError(error.message);
    }
  };
  if (!v) return null;
  const label = { insulated: 'Insulated', heated: 'Heated' } as const;
  return (
    <section className="inst-box" data-testid="winter-water">
      <h3>Winter water</h3>
      <p>
        {v.frozen ? 'Frozen' : 'Liquid'} · <WhyNum value={v.gallons} title="Tank size" /> gal outdoor tank.
        Frost <WhyNum value={v.frost} title="Frost" /> °F-days; it freezes at{' '}
        <WhyNum value={v.threshold} title="Freezes at" />.
        {v.meanF && (
          <>
            {' '}
            Yesterday averaged <WhyNum value={v.meanF} title="Mean outdoor temperature" /> °F.
          </>
        )}
      </p>
      {v.frozen && (
        <p className="small" role="status">
          <WhyNum value={v.locked} title="Water locked in ice" /> gal is locked in ice. The tank takes no new water
          until it thaws.
        </p>
      )}
      {v.heater && (
        <p className="small">
          Heater: <WhyNum value={v.heater.kWh} title="Heater electricity" /> of{' '}
          <WhyNum value={v.heater.need} title="Heater need" /> kWh yesterday.
        </p>
      )}
      <p className="small">
        Protection: {v.protection ? label[v.protection] : 'none'}
        {v.setup && !v.ready && ` (installing: ${fmtNum(v.setup.done)} of ${fmtNum(v.setup.hours)} h)`}
      </p>
      {v.options.map((o) =>
        o.protection === v.protection ? null : (
          <p className="small" key={o.protection}>
            <button className="btn small" onClick={() => act({ kind: 'winterize', id, protection: o.protection })}>
              {o.protection === 'insulated' ? 'Insulate' : 'Add heater'}
            </button>{' '}
            <WhyNum value={o.cost} title="Protection cost" format={fmtMoney} /> and {fmtNum(o.hours)} h of work
          </p>
        ),
      )}
      {v.protection && v.options.length > 0 && (
        <button className="btn small ghost" onClick={() => act({ kind: 'winterize', id, protection: null })}>
          Remove protection
        </button>
      )}
      <p className="small muted">
        Outdoor tanks freeze after enough cold days and lock their share of the raw water. Insulation makes a tank
        hold out four times longer; a heater uses electricity left after household use. Nothing is refunded.
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
