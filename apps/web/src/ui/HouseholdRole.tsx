import { useState } from 'react';
import { householdView, type ActionBody } from '@homestead/engine';
import { useGame } from '../store/game.ts';
import { WhyNum } from './Why.tsx';
import { fmtPct } from '../lib/format.ts';

const SKILL_LABEL = { building: 'Building (faster DIY)', growing: 'Growing (bigger harvests)', gathering: 'Gathering (more per hour)' } as const;

/** LL-36: who this person is, what they can do, and how well they are. */
export function HouseholdRole({ id }: { id: string }) {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const v = householdView(game, catalog, id);
  const [error, setError] = useState('');
  if (!v) return null;
  const act = (body: Extract<ActionBody, { kind: 'role' }>) => {
    try {
      useGame.getState().phase9Action(body);
      setError('');
    } catch (e) {
      if (!(e instanceof Error)) throw e;
      setError(e.message);
    }
  };
  return (
    <section className="inst-box" data-testid="household-role">
      <h3>Household role</h3>
      <label>
        Role{' '}
        <select aria-label="Household role" value={v.role} onChange={(e) => act({ kind: 'role', id, role: e.target.value as 'adult' | 'child' | 'elder' })}>
          <option value="adult">Adult</option>
          <option value="child">Child</option>
          <option value="elder">Elder</option>
        </select>
      </label>
      <p className="small">
        Needs <WhyNum value={v.needs} title="Share of an adult's needs" format={fmtPct} /> of an adult's; works at{' '}
        <WhyNum value={v.labor} title="Labor share today" format={fmtPct} /> today.
      </p>
      {v.condition && (
        <p className="small" role="status">
          {v.condition.kind === 'ill' ? 'Ill' : 'Injured'}: {v.condition.daysLeft} days to recover.
        </p>
      )}
      {v.illnessChance.value > 0 && (
        <p className="small">
          Low wellbeing: <WhyNum value={v.illnessChance} title="Daily illness chance" format={(n) => `${(n * 100).toFixed(2)}%`} /> chance a day of falling ill.
        </p>
      )}
      <table className="small">
        <tbody>
          {v.skills.map((k) => (
            <tr key={k.kind}>
              <td>{SKILL_LABEL[k.kind]}</td>
              <td>
                <WhyNum value={k.hours} title="Hours practiced" /> h
              </td>
              <td>
                +<WhyNum value={k.bonus} title="Personal bonus" format={fmtPct} />
              </td>
              <td>
                household +<WhyNum value={k.household} title="Household bonus" format={fmtPct} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        Skills grow with each person's share of the hours worked. Building and chainsaw work carry a small risk of
        injury.
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
