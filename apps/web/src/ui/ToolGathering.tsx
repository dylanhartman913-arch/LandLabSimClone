import { toolView } from '@homestead/engine';
import { useGame } from '../store/game.ts';
import { WhyNum } from './Why.tsx';

/** LL-34: what a tool adds to gathering at the land's nodes. */
export function ToolGathering({ id }: { id: string }) {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const v = toolView(game, catalog, id);
  if (!v) return null;
  return (
    <section className="inst-box" data-testid="tool-gathering">
      <h3>Tool use</h3>
      <p>
        Multiplies {v.resource} per hour of “{v.job}” by <WhyNum value={v.multiplier} title="Tool multiplier" />
        × at the land’s own nodes, up to <WhyNum value={v.hoursPerDay} title="Tool hours a day" /> h a day.
        Condition factor <WhyNum value={v.condition} title="Tool condition" />.
      </p>
      {v.fuel && (
        <p className="small">
          Burns <WhyNum value={v.fuel.perHour} title="Fuel per working hour" /> gal {v.fuel.resource} per working
          hour; <WhyNum value={v.fuel.stock} title="Fuel in stock" /> gal in stock. No fuel, no boost.
        </p>
      )}
      <p className="small">
        Last 7 days: <WhyNum value={v.toolHoursWeek} title="Tool hours" /> h at nodes,{' '}
        <WhyNum value={v.extraWeek} title="Extra yield" /> lb more than by hand
        {v.fuel && (
          <>
            , <WhyNum value={v.fuelWeek} title="Fuel burned" /> gal burned
          </>
        )}
        .
      </p>
      <p className="small muted">
        Tools no longer produce on their own: they speed up gathering and draw down the same deadfall, greens and
        clay. Without a gathering target, an owned tool keeps about a week of what the household uses.
      </p>
    </section>
  );
}
