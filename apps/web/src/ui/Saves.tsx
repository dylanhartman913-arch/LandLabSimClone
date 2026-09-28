import { useEffect, useRef, useState } from 'react';
import type { SaveFile } from '@homestead/engine';
import {
  AUTOSAVE,
  copySharedDesign,
  downloadSave,
  loadSave,
  readSave,
  shareLink,
  SLOTS,
  writeSave,
} from '../lib/saves.ts';
import { useGame } from '../store/game.ts';

/** Save slots, autosave and Rewind, export/import, and a read-only share link. */
export function Saves() {
  const st = useGame.getState();
  const readOnly = useGame((s) => s.readOnly);
  const warning = useGame((s) => s.storageWarning);
  const [slots, setSlots] = useState<Record<string, SaveFile | null>>({});
  const [link, setLink] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const refresh = async () => {
    const out: Record<string, SaveFile | null> = {};
    for (const k of [...SLOTS, AUTOSAVE]) out[k] = await readSave(k);
    setSlots(out);
  };
  useEffect(() => {
    void refresh();
  }, []);
  const when = (f: SaveFile | null | undefined) =>
    f ? `day ${f.absDay} · ${new Date(f.savedAt).toLocaleString()}` : 'empty';
  return (
    <section className="panel" role="dialog" aria-label="Saves" data-testid="saves">
      <header className="panel-head">
        <h2>Save and load</h2>
        <button className="btn ghost" onClick={() => st.setPanel(null)} aria-label="Close saves">
          ✕
        </button>
      </header>
      {warning && (
        <p className="warning" role="alert" data-testid="storage-warning">
          ⚠ {warning}
        </p>
      )}
      {readOnly && (
        <p className="warning">
          You're viewing a shared design, read only.{' '}
          <button className="btn" onClick={() => copySharedDesign()} data-testid="make-copy">
            Make a copy to edit
          </button>
        </p>
      )}
      <ul className="slots">
        {SLOTS.map((k, i) => (
          <li key={k}>
            <span>
              Slot {i + 1}: <span className="muted">{when(slots[k])}</span>
            </span>
            <button
              className="btn"
              onClick={async () => {
                if (await writeSave(k, `Slot ${i + 1}`)) st.toast(`Saved to slot ${i + 1}.`);
                await refresh();
              }}
              data-testid={`save-${k}`}
            >
              Save
            </button>
            <button
              className="btn"
              disabled={!slots[k]}
              onClick={() => {
                const r = loadSave(slots[k]);
                st.toast(r.message, r.verified ? 'info' : 'warn');
              }}
              data-testid={`load-${k}`}
            >
              Load
            </button>
          </li>
        ))}
        <li>
          <span>
            Autosave (every in-game week): <span className="muted">{when(slots[AUTOSAVE])}</span>
          </span>
          <button
            className="btn"
            disabled={!slots[AUTOSAVE]}
            onClick={() => {
              const r = loadSave(slots[AUTOSAVE], { verify: false });
              st.toast(`Rewound to the last autosave (day ${slots[AUTOSAVE]?.absDay}).`);
              void r;
            }}
            data-testid="rewind"
          >
            Rewind
          </button>
        </li>
      </ul>
      <h3>New game</h3>
      <div className="row">
        <button className="btn" onClick={() => st.setWizard(true)} data-testid="open-wizard">
          Start a new homestead…
        </button>
      </div>
      <h3>Files</h3>
      <div className="row">
        <button className="btn" onClick={() => downloadSave()} data-testid="export-save">
          Export .homestead.json
        </button>
        <button className="btn" onClick={() => file.current?.click()} data-testid="import-save">
          Import…
        </button>
        <input
          ref={file}
          type="file"
          accept=".json,.homestead.json,application/json"
          hidden
          data-testid="import-file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const r = loadSave(JSON.parse(await f.text()));
              st.toast(r.message, r.verified ? 'info' : 'warn');
            } catch (err) {
              st.toast(
                `That file couldn't be loaded: ${err instanceof Error ? err.message : String(err)}`,
                'warn',
              );
            }
            e.target.value = '';
          }}
        />
      </div>
      <p className="muted small">
        A save holds the seed, the starting settings, and every action you took, so it replays to exactly the
        same homestead.
      </p>
      <h3>Share</h3>
      <div className="row">
        <button className="btn" onClick={() => setLink(shareLink())} data-testid="share-link">
          Make a read-only link
        </button>
      </div>
      {link && (
        <input
          className="field"
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          aria-label="Share link"
          data-testid="share-url"
        />
      )}
    </section>
  );
}
