import { useState } from 'react';
import { fodderView, husbandryView, livestockView, seedingView, preservationView, waterInfrastructureView } from '@homestead/engine';
import { useGame } from '../store/game.ts';
import { fmtMoney, fmtPct } from '../lib/format.ts';
import { WhyNum } from './Why.tsx';

/** Whole counted days (display only). */
const wholeDays = (n: number) => String(Math.round(n));

/** Player policies and finite work orders for the opt-in food/animal mechanics. */
export function InstanceMechanics({ id }: { id: string }) {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const preserve = preservationView(game, catalog, id);
  const animal = livestockView(game, catalog, id);
  const water = waterInfrastructureView(game, catalog, id);
  const fodder = fodderView(game, catalog, id);
  const herd = husbandryView(game, catalog, id);
  const seeding = seedingView(game, catalog, id);
  const [resource, setResource] = useState(preserve?.order?.resource ?? preserve?.inputs[0]?.name ?? '');
  const [keep, setKeep] = useState(String(preserve?.order?.keep ?? 0));
  const [error, setError] = useState('');
  const act = (body: Parameters<ReturnType<typeof useGame.getState>['phase9Action']>[0]) => {
    try {
      useGame.getState().phase9Action(body);
      setError('');
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      setError(error.message);
    }
  };
  if (!preserve && !animal && !water && !fodder && !herd && !seeding) return null;
  return (
    <div className="inst-box" data-testid="instance-mechanics">
      {fodder && <section data-testid="fodder-controls">
        <h3>Feed and fodder</h3>
        <p>{fodder.text}</p>
        {fodder.rain && <p>Rainfall yield factor: <WhyNum value={fodder.rain} title="Meadow rainfall factor" format={fmtPct} />.</p>}
        {fodder.cutting && <p>Yesterday: <WhyNum value={fodder.cutting} title="Cutting labor" /> h cutting; <WhyNum value={fodder.saved!} title="Cutting labor saved" /> h saved with scythes.</p>}
        {fodder.capacity && <p>Shared feed pool: <WhyNum value={fodder.capacity} title="Feed pool capacity" /> cu ft.</p>}
      </section>}
      {seeding && <section data-testid="seeding-controls">
        <h3>Cover crop</h3>
        <p>{seeding.text}</p>
        <p className="small">Gardens in range: {seeding.gardens}. Area covered: <WhyNum value={seeding.share} title="Share of garden area covered" format={fmtPct} />. Seed sown this year: <WhyNum value={seeding.sown} title="Seed sown" format={fmtPct} />.</p>
      </section>}
      {herd && <section data-testid="husbandry-controls">
        <h3>{herd.kind === 'run' ? 'Predator protection' : herd.kind === 'paddock' ? 'Rotational grazing' : 'Hatching'}</h3>
        <p>{herd.text}</p>
        {herd.hatchRate && <p className="small">Expected hatch: <WhyNum value={herd.hatchRate} title="Hatch rate" format={fmtPct} /> of eggs set.</p>}
        {herd.status && <p className="small">{herd.status}</p>}
        {herd.daysLeft && <p>Clutch: <WhyNum value={herd.daysLeft} title="Days to hatch" format={wholeDays} /> days to hatch; <WhyNum value={herd.missed!} title="Missed days" format={wholeDays} /> missed.</p>}
        {herd.lastKWh && <p className="small">Yesterday: <WhyNum value={herd.lastKWh} title="Incubator power" /> kWh.</p>}
        {herd.protectedBirds && <p>Birds protected: <WhyNum value={herd.protectedBirds} title="Birds protected" />.</p>}
        {herd.paddock && <p>Pasture yield: × <WhyNum value={herd.paddock} title="Paddock yield factor" />.</p>}
        {(herd.kind === 'incubator' || herd.kind === 'nest') && (herd.set
          ? <button className="btn small ghost" onClick={() => act({ kind: 'hatch', id, operation: 'cancel' })}>Cancel clutch (eggs are lost)</button>
          : <>
              <button className="btn small" disabled={!!herd.blocked} onClick={() => act({ kind: 'hatch', id, operation: 'set' })}>Set eggs</button>
              {herd.blocked && <p className="small muted">{herd.blocked}</p>}
            </>)}
      </section>}
      {water && <section data-testid="water-infrastructure">
        <h3>Water infrastructure</h3>
        <p>{water.text}</p>
        {water.radius && <p>Connection radius: <WhyNum value={water.radius} title="Spring connection radius" /> ft.</p>}
        {water.warning && <p role="alert">{water.warning}</p>}
      </section>}
      {preserve && (
        <section data-testid="preservation-controls">
          <h3>Preserve surplus</h3>
          <p className="small">
            Up to <WhyNum value={preserve.capacity} title="Processing ceiling" /> input kcal/day at{' '}
            <WhyNum value={preserve.yield} title="Preservation yield" format={fmtPct} /> yield.
          </p>
          <p className="small">
            Each 1,000 input kcal needs <WhyNum value={preserve.labor} title="Processing labor" /> hours and{' '}
            <WhyNum value={preserve.energy} title="Processing energy" /> {preserve.energyUnit} of{' '}
            {preserve.energyResource}. Work uses spare labor after household needs and upkeep.
          </p>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              act({ kind: 'preserve', id, resource, keep: Number(keep) });
            }}
          >
            <label>
              Fresh food
              <select
                aria-label="Fresh food to preserve"
                value={resource}
                onChange={(e) => setResource(e.target.value)}
              >
                {preserve.inputs.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.name} ({r.unit})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Keep fresh
              <input
                aria-label="Fresh food reserve"
                type="number"
                min="0"
                step="any"
                value={keep}
                onChange={(e) => setKeep(e.target.value)}
              />
            </label>
            <button className="btn small" type="submit">
              {preserve.order ? 'Update preservation' : 'Start preservation'}
            </button>
            {preserve.order && (
              <button
                className="btn small ghost"
                type="button"
                onClick={() => act({ kind: 'preserve', id, resource: null, keep: 0 })}
              >
                Stop preservation
              </button>
            )}
          </form>
          <p className="small muted">
            {preserve.order
              ? `Standing rule: ${preserve.order.resource}; keep ${preserve.order.keep} in its canonical unit.`
              : 'No processing rule set.'}{' '}
            Missing food, energy or spare labor pauses processing. Root cellars and powered freezers store
            fresh food; canning and drying make shelf-stable Preserved food.
          </p>
          {preserve.lastBatch && (
            <p className="small" data-testid="preservation-result">
              Last batch: {preserve.lastBatch.outputKcal.toFixed(0)} preserved kcal from{' '}
              {preserve.lastBatch.inputKcal.toFixed(0)} fresh kcal.
            </p>
          )}
        </section>
      )}
      {animal && (
        <section data-testid="livestock-controls">
          <h3>Livestock lifecycle</h3>
          <p>
            <WhyNum value={animal.count} title="Cohort size" /> animals ·{' '}
            <WhyNum value={animal.age} title="Animal age" /> days old.
          </p>
          <p className="small">
            Growth remaining: <WhyNum value={animal.maturityRemaining} title="Growth remaining" /> fed days.
            Production factor:{' '}
            <WhyNum value={animal.production} title="Animal production factor" format={fmtPct} />. Daylight:{' '}
            <WhyNum value={animal.daylight} title="Daylight" /> hours.
          </p>
          {animal.warningDays && (
            <p role="alert" className="warn-text" data-testid="predator-warning">
              Predator warning: <WhyNum value={animal.warningDays} title="Predator countdown" /> days. Keep a
              working guardian within{' '}
              <WhyNum value={animal.guardianRadius} title="Guardian protection radius" /> ft or use secure
              housing.
            </p>
          )}
          <p className="small">
            {animal.protected
              ? 'Protected by working housing or a guardian.'
              : 'No working predator protection measured.'}
          </p>
          <button
            className="btn small"
            disabled={!animal.canBreed}
            onClick={() => act({ kind: 'livestock', id, operation: 'breed' })}
          >
            Breed / hatch ({fmtMoney(animal.breedingFee.value)})
          </button>
          {animal.canCull && (
            <button className="btn small" onClick={() => act({ kind: 'livestock', id, operation: 'cull' })}>
              Queue culling for {animal.cullMeat.value.toFixed(1)} lbs meat
            </button>
          )}
          {animal.breeding && (
            <p className="small">
              Breeding queued: <WhyNum value={animal.breedingDays} title="Birth countdown" /> fed days
              remaining, plus required work and room for the offspring.
            </p>
          )}
          {animal.culling && (
            <p className="small">
              Culling queued: needs <WhyNum value={animal.cullHours} title="Culling labor" /> total hours. The
              animals are removed when work finishes; no purchase refund.
            </p>
          )}
          {(animal.breeding || animal.culling) && (
            <button
              className="btn small ghost"
              onClick={() => act({ kind: 'livestock', id, operation: 'cancel' })}
            >
              Cancel animal work
            </button>
          )}
          <p className="small muted">
            Breeding fees buy outside breeding service or fertile stock. Feed, time, labor and parcel space
            still limit births. Canceling keeps spent fees and worked hours sunk.
          </p>
        </section>
      )}
      {error && (
        <p role="alert" className="warn-text">
          {error}
        </p>
      )}
    </div>
  );
}
