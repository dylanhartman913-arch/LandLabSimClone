import { MILESTONES, QUESTS, shortageHints } from '@homestead/engine';
import { fmtMoney, fmtNum, fmtPct } from '../lib/format.ts';
import { useGame } from '../store/game.ts';

/** The current tutorial quest, pinned top-right: one at a time, skippable. */
export function QuestCard() {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const progress = useGame((s) => s.progress);
  const readOnly = useGame((s) => s.readOnly);
  if (progress.tutorialSkipped || readOnly) return null;
  const q = QUESTS.find((x) => progress.quests[x.id] === undefined);
  const done = QUESTS.filter((x) => progress.quests[x.id] !== undefined).length;
  const badges = MILESTONES.filter((m) => progress.milestones[m.id] !== undefined);
  if (!q) {
    return badges.length ? <Badges titles={badges.map((b) => b.title)} /> : null;
  }
  const st = q.check(game, catalog);
  return (
    <aside className="quest" aria-label="Current quest" data-testid="quest">
      <div className="quest-top">
        <span className="muted small">
          Quest {done + 1} of {QUESTS.length} · moves <strong>{q.row}</strong>
        </span>
        <button className="btn ghost small" onClick={() => useGame.getState().skipTutorial()} data-testid="skip-tutorial">
          Skip tutorial
        </button>
      </div>
      <h3 data-testid="quest-title">{q.title}</h3>
      <p className="small">{q.hint}</p>
      <div className="bar" role="progressbar" aria-valuenow={Math.round(st.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Quest progress">
        <div className="bar-fill" style={{ width: fmtPct(st.progress) }} />
      </div>
      <p className="small muted" data-testid="quest-detail">
        {st.detail}
      </p>
      {badges.length > 0 && <Badges titles={badges.map((b) => b.title)} />}
    </aside>
  );
}

function Badges({ titles }: { titles: string[] }) {
  return (
    <div className="badges" aria-label="Milestones" data-testid="badges">
      {titles.map((t) => (
        <span key={t} className="badge-quiet" title={t}>
          ★ {t}
        </span>
      ))}
    </div>
  );
}

/** When a shortage has lasted a week: what could fix it, cheapest per unit of shortfall covered. */
export function HintCard() {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const dismissed = useGame((s) => s.progress.dismissedHints);
  const readOnly = useGame((s) => s.readOnly);
  if (readOnly || game.ledgers.length < 7) return null;
  const hints = shortageHints(game, catalog).filter(
    (h) => dismissed[h.resource] === undefined || game.calendar.absDay - dismissed[h.resource]! > 28,
  );
  const h = hints[0];
  if (!h) return null;
  const st = useGame.getState();
  return (
    <aside className="hint" aria-label="Hint" data-testid="hint">
      <div className="quest-top">
        <strong>
          <span aria-hidden="true">⚠</span> Short on {h.resource} all week
        </strong>
        <button className="btn ghost small" onClick={() => st.dismissHint(h.resource)} aria-label="Dismiss hint">
          ✕
        </button>
      </div>
      <p className="small muted">
        About {fmtNum(h.shortfall)} {h.unit} a week missing. Systems that could cover it, cheapest per unit covered:
      </p>
      <ul className="hint-list">
        {h.fixes.map((f) => (
          <li key={f.systemId}>
            <button className="link" onClick={() => st.openCard(f.systemId)}>
              {f.name}
            </button>{' '}
            <span className="small">
              {fmtMoney(f.cost)} {f.mode === 'diy' ? 'DIY' : ''}, covers {fmtNum(f.covers)} {h.unit}/wk
              {f.needs.length ? `; also needs ${f.needs.join(', ')}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
