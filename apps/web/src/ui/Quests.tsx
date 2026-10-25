import { useRef, useState } from 'react';
import { ALERT_GROUPS, MILESTONES, QUESTS, questView, shortageHints, survivalAlerts, transitionForecast, winterPreparation, type SurvivalAlert } from '@homestead/engine';
import type { QuestShow } from '@homestead/catalog';
import { fmtMoney, fmtNum, fmtPct } from '../lib/format.ts';
import { useGame } from '../store/game.ts';
import { usePlan } from '../store/plan.ts';

/** The current tutorial quest, pinned top-right: one at a time, skippable. */
export function QuestCard() {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const progress = useGame((s) => s.progress);
  const readOnly = useGame((s) => s.readOnly);
  if (progress.tutorialSkipped || readOnly) return null;
  if (game.tutorial) return <TutorialCard />;
  // A start without a quest line (LL-51's cabin and farm) has no tutorial; the old line is for custom games.
  const q = game.start ? undefined : QUESTS.find((x) => progress.quests[x.id] === undefined);
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
      <h2 className="quest-title" data-testid="quest-title">
        {q.title}
      </h2>
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

/**
 * Needs and bottlenecks (LL-14): every active alert, grouped and ranked by deadline, with direct
 * actions; design advice after them in Improve. Collapses to one line while placing.
 */
export function HintCard() {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const dismissed = useGame((s) => s.progress.dismissedHints);
  const readOnly = useGame((s) => s.readOnly);
  const placing = useGame((s) => s.tool.kind === 'place');
  const actionCount = useGame((s) => s.actions.length);
  const [open, setOpen] = useState(true);
  // The 90-day projection is a full simulation: refresh it weekly, and whenever the player acts.
  const forecast = useRef<{ key: string; value: ReturnType<typeof transitionForecast> } | null>(null);
  if (readOnly) return null;
  const key = `${Math.floor(game.calendar.absDay / 7)}:${actionCount}`;
  if (forecast.current?.key !== key) forecast.current = { key, value: transitionForecast(game, catalog) };
  const alerts = survivalAlerts(game, catalog, forecast.current.value);
  const hints =
    game.ledgers.length < 7
      ? []
      : shortageHints(game, catalog).filter(
          (h) => dismissed[h.resource] === undefined || game.calendar.absDay - dismissed[h.resource]! > 28,
        );
  if (!alerts.length && !hints.length) return null;
  const st = useGame.getState();
  const expanded = open && !placing;
  const top = alerts[0];
  return (
    <aside className="hint alerts" aria-label="Needs and bottlenecks" data-testid="hint">
      <div className="quest-top">
        <strong>
          {alerts.length ? `Needs and bottlenecks (${alerts.length})` : 'Improve'}
        </strong>
        <button className="btn ghost small" onClick={() => setOpen(!open)} aria-expanded={expanded} aria-label={expanded ? 'Collapse needs' : 'Expand needs'}>
          {expanded ? '−' : '+'}
        </button>
      </div>
      {!expanded && top && <p className="small" data-testid="alerts-collapsed">{top.title} · {deadline(top)}</p>}
      {expanded && (
        <div className="alerts-body">
          {ALERT_GROUPS.map((g) => {
            const items = alerts.filter((a) => a.group === g.id);
            if (!items.length) return null;
            return (
              <section key={g.id} data-testid={`alerts-${g.id}`}>
                <h4 className="alerts-group">{g.label}</h4>
                {items.map((a) => (
                  <details key={a.id} open={a === top} data-testid={`alert-${a.id}`} className="alert-item">
                    <summary>
                      <strong>{a.title}</strong> <span className="chip small">{deadline(a)}</span>
                    </summary>
                    <p className="small">{a.detail}</p>
                    <AlertActions alert={a} />
                  </details>
                ))}
              </section>
            );
          })}
          {hints.length > 0 && (
            <section data-testid="alerts-improve">
              <h4 className="alerts-group">Improve</h4>
              {hints.slice(0, 3).map((h) => (
                <details key={h.resource} className="alert-item" open={!alerts.length && h === hints[0]}>
                  <summary>
                    <span aria-hidden="true">⚠</span> Short on {h.resource} all week{' '}
                    <button className="btn ghost small" onClick={() => st.dismissHint(h.resource)} aria-label={`Dismiss ${h.resource} hint`}>
                      ✕
                    </button>
                  </summary>
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
                </details>
              ))}
            </section>
          )}
        </div>
      )}
    </aside>
  );
}

/** Today's shortages count down to wellbeing penalties; warnings count down to the shortage. */
function deadline(a: SurvivalAlert): string {
  const d = Math.floor(a.days ?? 0);
  if (a.current) return d ? `penalties in ${d} d` : 'penalties now';
  return d ? `in about ${d} d` : 'now';
}

function AlertActions({ alert }: { alert: SurvivalAlert }) {
  const st = useGame.getState();
  return (
    <div className="alert-actions">
      {alert.resource && <button className="btn small" onClick={() => st.openResource(alert.resource!)}>Find {alert.resource} sources</button>}
      {['food-runway', 'water-runway', 'cash-runway'].includes(alert.id) && <button className="btn small" onClick={() => st.setPanel('market')}>Open Market</button>}
      {alert.id === 'forecast' && (
        <button className="btn small" onClick={() => { usePlan.getState().setTab('transition'); usePlan.getState().setOpen(true); }}>
          See the forecast
        </button>
      )}
      {alert.work && <button className="btn small" onClick={() => st.setPanel('work')}>Recovery and construction</button>}
    </div>
  );
}

/** "Show me": point at the drawer item, node, resource page, or panel a quest is about. */
export function showMe(show: QuestShow): void {
  const st = useGame.getState();
  switch (show.kind) {
    case 'system': {
      const sys = st.catalog.systems.find((x) => x.name === show.name);
      const owned = sys && st.game.instances.find((i) => i.systemId === sys.id && i.status === 'active') || (sys && st.game.instances.find((i) => i.systemId === sys.id));
      if (owned) { st.focusInstance(owned.id); st.openCard(owned.systemId, owned.id); return; }
      st.setDrawer(true);
      st.setDrawerTab('systems');
      st.setDrawerQuery(show.name);
      if (sys) st.openCard(sys.id);
      // The filter only points at the tile: clear it once the card closes or placement starts.
      const off = useGame.subscribe((s) => {
        if (s.cardSystemId === sys?.id && s.tool.kind !== 'place') return;
        if (s.drawerQuery === show.name) s.setDrawerQuery('');
        off();
      });
      return;
    }
    case 'node': {
      const n = st.game.site.nodes.find((x) => x.type === show.type);
      if (n) st.focusNode(n.id);
      return;
    }
    case 'resource':
      st.openResource(show.name);
      return;
    case 'panel':
      st.setPanel(show.panel as Parameters<typeof st.setPanel>[0]);
      return;
  }
}

/** The pinned quest card for a start's quest line (G16): goal, progress, show me, and the row it moves. */
function TutorialCard() {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const v = questView(game, catalog);
  if (!v) return null;
  const { quest, status } = v;
  return (
    <aside className="quest" aria-label="Current quest" data-testid="quest">
      <div className="quest-top">
        <span className="muted small">
          Quest {v.index + 1} of {v.count} · moves <strong>{quest.row}</strong>
        </span>
        <button className="btn ghost small" onClick={() => useGame.getState().skipTutorial()} data-testid="skip-tutorial">
          Skip tutorial
        </button>
      </div>
      <h2 className="quest-title" data-testid="quest-title">
        {quest.title}
      </h2>
      <p className="small">{quest.reason}</p>
      {(v.index === 0 || quest.row === 'Heated shelter') && (
        <p className="small muted" data-testid="quest-season">
          {v.index === 0 ? 'Stabilize safe water and storage, food access and recurring consumables before adding more systems. ' : ''}
          {winterPreparation(game)}
        </p>
      )}
      {quest.goal.kind === 'gathered' && <p className="small">Open Work and set a weekly cap for the gathering job (firewood: 6 h/week), or an auto-gather reserve rule. Pointing at a node alone does not start work.</p>}
      <div className="bar" role="progressbar" aria-valuenow={Math.round(status.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Quest progress">
        <div className="bar-fill" style={{ width: fmtPct(status.progress) }} />
      </div>
      <p className="small muted" data-testid="quest-detail">
        {status.detail}
      </p>
      <div className="row">
        <button className="btn small" onClick={() => showMe(quest.show)} data-testid="quest-show-me">
          Show me
        </button>
        <span className="muted small" data-testid="quest-assistance">Assistance from {v.neighbor}: {v.rewardText}. Outside supplies and cash are assistance; they are not production by your systems.</span>
      </div>
    </aside>
  );
}
