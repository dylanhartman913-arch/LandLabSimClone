import { fertilityView } from '@homestead/engine';
import { useGame } from '../store/game.ts';
import { WhyNum } from './Why.tsx';
import { fmtPct } from '../lib/format.ts';

/** LL-35: a garden's soil fertility and what fed or drew it this week. */
export function SoilFertility({ id }: { id: string }) {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const v = fertilityView(game, catalog, id);
  if (!v) return null;
  return (
    <section className="inst-box" data-testid="soil-fertility">
      <h3>Soil fertility</h3>
      <p>
        Fertility <WhyNum value={v.fertility} title="Soil fertility" /> · harvest at{' '}
        <WhyNum value={v.yield} title="Yield from fertility" format={fmtPct} /> of the catalog yield.
      </p>
      <p className="small">
        A full year of cropping removes <WhyNum value={v.drawPerYear} title="Fertility drawn a year" />;{' '}
        <WhyNum value={v.compostPerYear} title="Compost a year" /> lb of compost a year puts it back.
      </p>
      <p className="small">
        Last 7 days: <WhyNum value={v.week.compost} title="Compost received" /> lb compost,{' '}
        <WhyNum value={v.week.manure} title="Manure worked in" /> lb manure; fertility{' '}
        <WhyNum value={v.week.gained} title="Fertility added" /> added,{' '}
        <WhyNum value={v.week.drawn} title="Fertility drawn" /> drawn by cropping.
      </p>
      <p className="small muted">
        Without compost the bed keeps cropping, but each harvest lowers fertility and the next one is smaller.
        Manure fills a compost shortfall at half strength; a clover cover crop within 100 ft adds more.
      </p>
    </section>
  );
}
