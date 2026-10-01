import { useMemo, useState } from 'react';
import { designCounts, resourceWeek, systemFlows } from '@homestead/engine';
import { categoryOptions } from '../lib/catalog-view.ts';
import { fmtMoney, fmtNum, fmtPct } from '../lib/format.ts';
import { buildSearchIndex, searchSystems } from '../lib/search.ts';
import { useGame, type DrawerTab } from '../store/game.ts';
import { SystemIcon } from './SystemIcon.tsx';

const TABS: { id: DrawerTab; label: string }[] = [
  { id: 'systems', label: 'Systems' },
  { id: 'inputs', label: 'Inputs' },
  { id: 'outputs', label: 'Outputs' },
];

export function Drawer() {
  const open = useGame((s) => s.drawerOpen);
  const setOpen = useGame((s) => s.setDrawer);
  const tab = useGame((s) => s.drawerTab);
  const setTab = useGame((s) => s.setDrawerTab);
  return (
    <aside className={`drawer ${open ? 'open' : 'closed'}`} aria-label="Catalog drawer" data-testid="drawer">
      <button
        className="drawer-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={open ? 'Collapse drawer' : 'Expand drawer'}
        data-testid="drawer-toggle"
      >
        <span className="drawer-toggle-glyph" aria-hidden="true">
          {open ? '‹' : '›'}
        </span>
      </button>
      {open && (
        <>
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={`tab ${tab === t.id ? 'on' : ''}`}
                onClick={() => setTab(t.id)}
                data-testid={`tab-${t.id}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="drawer-body" role="tabpanel">
            {tab === 'systems' && <SystemsTab />}
            {tab === 'inputs' && <FlowsTab kind="inputs" />}
            {tab === 'outputs' && <FlowsTab kind="outputs" />}
          </div>
        </>
      )}
    </aside>
  );
}

function SystemsTab() {
  const catalog = useGame((s) => s.catalog);
  const game = useGame((s) => s.game);
  const openCard = useGame((s) => s.openCard);
  const [mode, setMode] = useState<'all' | 'my'>('all');
  const [category, setCategory] = useState('');
  const query = useGame((s) => s.drawerQuery);
  const setQuery = useGame((s) => s.setDrawerQuery);
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null);
  const index = useMemo(() => buildSearchIndex(catalog), [catalog]);
  const cats = useMemo(() => categoryOptions(catalog), [catalog]);
  const mine = designCounts(game);
  const searchMode = useGame((s) => s.drawerSearchMode);
  const setSearchMode = useGame((s) => s.setDrawerSearchMode);
  let list = searchSystems(index, query, searchMode);
  if (category) list = list.filter((s) => s.categories.includes(category));
  if (mode === 'my') list = list.filter((s) => mine[s.id]);
  const tipView = tip ? systemFlows(catalog, tip.id, game.site.assumptions) : null;

  return (
    <div className="systems-tab">
      <div className="seg" role="radiogroup" aria-label="Show">
        {(['all', 'my'] as const).map((m) => (
          <button
            key={m}
            role="radio"
            aria-checked={mode === m}
            className={`seg-btn ${mode === m ? 'on' : ''}`}
            onClick={() => setMode(m)}
            data-testid={`seg-${m}`}
          >
            {m === 'all' ? 'All' : 'My'}
          </button>
        ))}
      </div>
      <select
        className="field"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        aria-label="Category"
        data-testid="category-filter"
      >
        <option value="">All categories ({catalog.systems.length})</option>
        {cats.map((c) => (
          <option key={c.name} value={c.name}>
            {c.name} ({c.count})
          </option>
        ))}
      </select>
      <input
        className="field"
        type="search"
        placeholder="Search: name, category, or what it makes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search systems"
        data-testid="system-search"
      />
      <div className="seg small" role="radiogroup" aria-label="Search in">
        {(['any', 'makes', 'uses'] as const).map((m) => (
          <button
            key={m}
            role="radio"
            aria-checked={searchMode === m}
            className={`seg-btn ${searchMode === m ? 'on' : ''}`}
            onClick={() => setSearchMode(m)}
            data-testid={`search-${m}`}
          >
            {m === 'any' ? 'Anything' : m === 'makes' ? 'Makes it' : 'Uses it'}
          </button>
        ))}
      </div>
      <div className="tile-grid" data-testid="tile-grid">
        {list.map((s) => (
          <button
            key={s.id}
            className="tile"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-homestead-system', s.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => openCard(s.id)}
            onMouseEnter={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setTip({ id: s.id, x: r.right + 8, y: r.top });
            }}
            onMouseLeave={() => setTip(null)}
            onFocus={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setTip({ id: s.id, x: r.right + 8, y: r.top });
            }}
            onBlur={() => setTip(null)}
            data-testid={`tile-${s.id}`}
            data-name={s.name}
          >
            <SystemIcon system={s} size={40} />
            <span className="tile-name">{s.name}</span>
            {mine[s.id] ? <span className="tile-count">×{mine[s.id]}</span> : null}
          </button>
        ))}
        {list.length === 0 && (
          <p className="empty">Nothing matches. Try a resource, like “eggs” or “heat”.</p>
        )}
      </div>
      {tip && tipView && (
        <div className="tile-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
          <strong>{tipView.system.name}</strong>
          <div>
            {fmtMoney(tipView.system.costBuy)}
            {tipView.system.costDiy !== undefined ? ` · DIY ${fmtMoney(tipView.system.costDiy)}` : ''}
          </div>
          {tipView.topOutputs.map((o) => (
            <div key={o.flow.id} className="tip-sub">
              Makes {fmtNum(o.qty.value)} {o.unit} {o.resource} {o.periodLabel}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FlowsTab({ kind }: { kind: 'inputs' | 'outputs' }) {
  const game = useGame((s) => s.game);
  const catalog = useGame((s) => s.catalog);
  const highlight = useGame((s) => s.highlightResource);
  const setHighlight = useGame((s) => s.setHighlight);
  const [shortOnly, setShortOnly] = useState(false);
  const rows = resourceWeek(game, catalog).filter((r) =>
    kind === 'inputs' ? r.needed.value > 0 && (!shortOnly || r.short) : r.produced.value > 0,
  );
  if (!game.ledgers.length) {
    return <p className="empty">Press play to see how resources move. Numbers cover the last 7 days.</p>;
  }
  return (
    <div className="flows-tab">
      {kind === 'inputs' && (
        <label className="check">
          <input type="checkbox" checked={shortOnly} onChange={(e) => setShortOnly(e.target.checked)} />{' '}
          Shortages only
        </label>
      )}
      <p className="hint">
        Last 7 days. Click a row to highlight who makes (green) and uses (amber) it on the map, or its name for
        where it comes from.
      </p>
      <ul className="res-list">
        {rows.map((r) => (
          <li key={r.resource}>
            <button
              className={`res-row ${highlight === r.resource ? 'on' : ''}`}
              onClick={() => setHighlight(highlight === r.resource ? null : r.resource)}
              aria-pressed={highlight === r.resource}
              data-testid={`res-${r.resource}`}
            >
              <div className="res-head">
                <span>
                  {r.short && kind === 'inputs' ? (
                    <span className="badge warn" aria-label="Short">
                      ! Short
                    </span>
                  ) : null}{' '}
                  <span
                    role="link"
                    tabIndex={0}
                    className="link"
                    onClick={(e) => {
                      e.stopPropagation();
                      useGame.getState().openResource(r.resource);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation();
                        useGame.getState().openResource(r.resource);
                      }
                    }}
                    data-testid={`res-page-${r.resource}`}
                  >
                    {r.resource}
                  </span>
                </span>
                {kind === 'inputs' ? (
                  <span className="res-num" title={r.share.explain.formula}>
                    {fmtNum(r.supplied.value)} / {fmtNum(r.needed.value)} {r.unit}
                  </span>
                ) : (
                  <span className="res-num" title={r.produced.explain.formula}>
                    {fmtNum(r.produced.value)} {r.unit}
                  </span>
                )}
              </div>
              {kind === 'inputs' ? (
                <div
                  className="bar"
                  role="meter"
                  aria-valuenow={Math.round(r.share.value * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className={`bar-fill ${r.short ? 'short' : ''}`}
                    style={{ width: fmtPct(Math.min(1, r.share.value)) }}
                  />
                </div>
              ) : (
                <WhereItWent r={r} />
              )}
            </button>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="empty">{shortOnly ? 'No shortages this week.' : 'Nothing yet.'}</li>
        )}
      </ul>
    </div>
  );
}

function WhereItWent({ r }: { r: ReturnType<typeof resourceWeek>[number] }) {
  const parts = [
    { k: 'used', v: r.consumed, cls: 'used' },
    { k: 'stored', v: r.stored, cls: 'stored' },
    { k: 'spilled', v: r.spilled, cls: 'spilled' },
    { k: 'spoiled', v: r.spoiled, cls: 'spoiled' },
  ].filter((p) => p.v.value > 1e-9);
  return (
    <div className="went">
      {parts.map((p) => (
        <span key={p.k} className={`went-chip ${p.cls}`} title={p.v.explain.formula}>
          {p.k} {fmtNum(p.v.value)}
        </span>
      ))}
    </div>
  );
}
