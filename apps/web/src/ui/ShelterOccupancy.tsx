import { useState } from 'react';
import { occupancyView, type ActionBody } from '@homestead/engine';
import { useGame } from '../store/game.ts';
import { WhyNum } from './Why.tsx';
import { fmtPct } from '../lib/format.ts';

export function ShelterOccupancy({ id }: { id: string }) {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const v = occupancyView(game, catalog, id);
  const [error, setError] = useState('');
  const act = (body: Extract<ActionBody, { kind: 'assignShelter' | 'closeShelter' }>) => {
    try {
      useGame.getState().phase9Action(body);
      setError('');
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      setError(error.message);
    }
  };
  if (!v) return null;
  return (
    <section className="inst-box" data-testid="shelter-occupancy">
      <h3>Shelter occupancy</h3>
      {v.kind === 'person' ? (
        <label>
          Lives in
          <select
            aria-label="Resident shelter"
            value={v.home ?? ''}
            onChange={(e) => act({ kind: 'assignShelter', id, shelterId: e.target.value || null })}
          >
            <option value="">No shelter assigned</option>
            {v.shelters.map((sh) => (
              <option key={sh.id} value={sh.id}>
                {sh.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <p>
            {v.closed ? 'Closed' : 'Open'} · Living space{' '}
            <WhyNum value={v.capacity} title="Shelter capacity" /> sq ft; residents need{' '}
            <WhyNum value={v.need} title="Assigned shelter need" /> sq ft.
          </p>
          <p className="small">{v.residents.length ? 'Assigned residents:' : 'No residents assigned.'}</p>
          {v.residents.map((p) => (
            <button
              className="btn small ghost"
              key={p.id}
              onClick={() =>
                useGame.getState().openCard(game.instances.find((i) => i.id === p.id)!.systemId, p.id)
              }
            >
              {p.name}
            </button>
          ))}
          {v.heatNeeded && v.heatReceived && (
            <p className="small">
              Yesterday’s heat: <WhyNum value={v.heatReceived} title="Heat delivered to shelter" /> /{' '}
              <WhyNum value={v.heatNeeded} title="Shelter heat request" /> BTU.
            </p>
          )}
          <p className="small">
            Upkeep: <WhyNum value={v.upkeep} title="Shelter upkeep share" format={fmtPct} /> of catalog labor
            and capital. Empty shelters draw no heat or cooling. Closed shelters retain their roof and
            storage.
          </p>
          <button
            className="btn small"
            disabled={!v.closed && !v.canClose}
            onClick={() => act({ kind: 'closeShelter', id, closed: !v.closed })}
          >
            {v.closed ? 'Reopen shelter' : 'Close empty shelter'}
          </button>
          {!v.closed && v.residents.length > 0 && (
            <p className="small muted">
              Move assigned residents using their person cards before closing. People in town keep their
              assignment.
            </p>
          )}
        </>
      )}
      <p className="small muted">
        Living space is shared within each shelter. Overcrowding lowers its residents’ shelter coverage. Heat
        must reach the shelter where each resident lives.
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
