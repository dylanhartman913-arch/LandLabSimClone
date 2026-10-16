import { useMemo } from 'react';
import { projectPreview, type BuildMode } from '@homestead/engine';
import { useGame } from '../store/game.ts';
import { fmtMoney } from '../lib/format.ts';
import { WhyNum } from './Why.tsx';

/** This is a forecast; purchasing and positioning remain explicit player actions. */
export function ProjectPreview({ systemId, mode }: { systemId: string; mode: BuildMode }) {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const v = useMemo(() => projectPreview(game, catalog, systemId, mode), [game, catalog, systemId, mode]);
  return (
    <details data-testid="project-preview" open>
      <summary>Before you commit</summary>
      <p>
        Purchase <WhyNum value={v.cost} title="Project purchase" format={fmtMoney} /> · cash remaining{' '}
        <WhyNum
          value={v.cashAfter}
          title="Cash after purchase"
          format={fmtMoney}
          testId="project-cash-after"
        />
        .
      </p>
      {v.cashAfter.value < 0 && (
        <p className="warn-text">
          This purchase would put cash below zero. Income and operating supplies still need funding.
        </p>
      )}
      <p>
        <WhyNum value={v.hours} title="Setup labor" unit="h" /> setup ·{' '}
        {v.eta === null
          ? 'No completion forecast within 365 days; check available space, work priorities, caps and recovery.'
          : `Forecast ${v.eta} days with current work commitments`}
        .
      </p>
      {v.crew && v.hours.value > 0 && (
        <p data-testid="project-crew">
          Optional outside construction: {fmtMoney(v.crew.cost)}, {v.crew.days} days at {v.crew.hoursPerDay}{' '}
          h/day; cash after purchase and crew{' '}
          <WhyNum value={v.cashAfterCrew} title="Cash after project and crew" format={fmtMoney} />. Book
          explicitly in Work after placement. {v.crew.blocked}
        </p>
      )}
      <p className="muted small">
        Schedule uses a sample legal position and current policies, supplies and wellbeing. Map placement
        checks the chosen connections. Work offers emergency priority and paid crews after placement.
      </p>
      <p>
        Running cost <WhyNum value={v.running} title="Nominal ongoing money demand" format={fmtMoney} />
        /week before usage-priced deliveries · maturity after completion{' '}
        <WhyNum value={v.maturityDays} title="Days to full output" unit="days" />.
      </p>
      {v.materials.length > 0 && (
        <>
          <strong>One-time materials</strong>
          <ul>
            {v.materials.map((m) => (
              <li key={m.resource}>
                {m.resource}: <WhyNum value={m.needed} title={`${m.resource} to build`} unit={m.unit} />;
                missing from stock <WhyNum value={m.missing} title={`${m.resource} missing`} unit={m.unit} />
              </li>
            ))}
          </ul>
          <p className="muted small">
            The current construction rule brings missing materials in without a separate market charge. They
            are not an ongoing supply.
          </p>
        </>
      )}
      <strong>Operating requirements</strong>
      <ul>
        {v.recurring.map((f) => (
          <li key={f.flow.id}>
            {f.resource}: <WhyNum value={f.qty} title={`${f.resource} requirement`} unit={f.unit} />{' '}
            {f.periodLabel} · {f.flow.inputRole ?? 'required'}
          </li>
        ))}
      </ul>
      <strong>Change to planned demand</strong>
      <ul data-testid="project-demand">
        {v.demand.map((r) => (
          <li key={r.resource}>
            {r.resource}:{' '}
            <WhyNum
              value={r.delta}
              title={`${r.resource} added demand`}
              unit={r.capacity ? `${r.unit} capacity` : `${r.unit}/week`}
            />
          </li>
        ))}
      </ul>
      {v.winter && (v.winter.added.value > 0 || v.winter.gap.value > 0) && (
        <p data-testid="project-heat">
          Added heat demand{' '}
          <WhyNum value={v.winter.added} title="Added annual-average heat demand" unit="BTU/week" />. Project
          cold-day demand{' '}
          <WhyNum value={v.winter.peak} title="Project coldest-day heat demand" unit="BTU/day" />. Household
          cold-day gap even with full inputs:{' '}
          <WhyNum value={v.winter.gap} title="Planned cold-day heat gap" unit="BTU/day" />. Every shelter
          draws heat even when unused; adding shelter does not replace the old one.
        </p>
      )}
      {v.food && (
        <div data-testid="project-food">
          <p>
            Nominal annual average <WhyNum value={v.food.daily} title="Nominal food energy" unit="kcal/day" />
            ; <WhyNum
              value={v.food.perPerson}
              title="Food per adult equivalent"
              unit="kcal/person/day"
            /> ·{' '}
            <WhyNum
              value={v.food.share}
              title="Share of household food demand"
              format={(n) => `${(n * 100).toFixed(2)}%`}
            />{' '}
            of this household's need with full required inputs and maturity, before optional boosts.
          </p>
          <p className="muted small">
            {v.food.timing}. This is a nominal estimate rather than guaranteed meals; optional boosts can
            raise yields, while planting reserves, food processing, animal feed, water, labor and seasonality
            can reduce what is eaten. Small beds demonstrate growing; compare their calorie share before
            relying on them.
          </p>
        </div>
      )}
    </details>
  );
}
