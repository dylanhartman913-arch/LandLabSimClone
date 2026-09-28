import { catalog, getSite, SITES } from '@homestead/catalog';
import {
  ENGINE_VERSION,
  gameDigest,
  initGame,
  placeDesign,
  replay,
  resolveDesign,
  SAVE_SCHEMA,
  validateSave,
  type Action,
  type GameInit,
  type GameState,
  type SaveFile,
} from '@homestead/engine';
import { useGame, type Progress } from '../store/game.ts';
import { idbGet, idbSet } from './idb.ts';

export const SLOTS = ['slot-1', 'slot-2', 'slot-3'] as const;
export const AUTOSAVE = 'autosave';

export function makeSave(name: string): SaveFile & { progress: Progress } {
  const s = useGame.getState();
  return {
    progress: s.progress,
    schema: SAVE_SCHEMA,
    engineVersion: ENGINE_VERSION,
    catalogSha256: s.catalog.source.sha256,
    name,
    savedAt: new Date().toISOString(),
    init: s.init,
    actions: s.actions,
    absDay: s.game.calendar.absDay,
    digest: gameDigest(s.game),
    state: s.game,
  };
}

export async function writeSave(key: string, name: string): Promise<boolean> {
  const r = await idbSet(key, makeSave(name));
  const st = useGame.getState();
  if (!r.ok) {
    st.setStorageWarning(`Saving isn't available in this browser (${r.error}). Export a file instead.`);
    return false;
  }
  if (st.storageWarning) st.setStorageWarning(null);
  return true;
}

export async function readSave(key: string): Promise<SaveFile | null> {
  const r = await idbGet<SaveFile>(key);
  if (!r.ok) {
    useGame.getState().setStorageWarning(`Saves aren't available in this browser (${r.error}).`);
    return null;
  }
  return r.value ?? null;
}

export interface LoadResult {
  verified: boolean;
  message: string;
}

/**
 * Load a save. The action log is replayed from the start and its digest
 * compared with the file's; if they differ (e.g. an edited catalog), the
 * snapshot is used and the player is told.
 */
export function loadSave(file: unknown, opts: { verify?: boolean } = {}): LoadResult {
  const save = validateSave(file);
  let state: GameState = save.state;
  let verified = false;
  let message = `Loaded “${save.name}”.`;
  if (opts.verify !== false) {
    try {
      const again = replay(catalog, save.init, save.actions, save.absDay);
      verified = gameDigest(again) === save.digest;
      if (verified) {
        state = again;
        message = `Loaded “${save.name}”. Replay verified: ${save.actions.length} actions over ${save.absDay} days.`;
      } else {
        message = `Loaded “${save.name}” from its snapshot: replaying the actions gave a different result (the catalog may have changed).`;
      }
    } catch (e) {
      message = `Loaded “${save.name}” from its snapshot: replay failed (${e instanceof Error ? e.message : String(e)}).`;
    }
  }
  const progress = (file as { progress?: Progress }).progress;
  useGame.getState().loadGame(save.init, save.actions, state, progress ? { progress } : {});
  return { verified, message };
}

export function downloadSave(): void {
  const save = makeSave('Exported game');
  const blob = new Blob([JSON.stringify(save)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `homestead-day-${save.absDay}.homestead.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- Shared designs (?design=) -------------------------------------------------

interface SharedDesign {
  name: string;
  site: string;
  acres: number;
  counts: Record<string, number>;
}

function b64urlEncode(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(b + '='.repeat((4 - (b.length % 4)) % 4))));
}

/** A link that opens the current layout read-only for someone else. */
export function shareLink(): string {
  const s = useGame.getState();
  const counts: Record<string, number> = {};
  for (const i of s.game.instances) counts[i.systemId] = (counts[i.systemId] ?? 0) + 1;
  const d: SharedDesign = {
    name: 'Shared homestead',
    site: s.game.site.id,
    acres: s.game.settings.parcelAcres,
    counts,
  };
  const url = new URL(window.location.href);
  url.search = `?design=${b64urlEncode(JSON.stringify(d))}`;
  return url.toString();
}

/** Open a shared design read-only (laid out as built). */
export function openSharedDesign(param: string): string {
  const d = JSON.parse(b64urlDecode(param)) as SharedDesign;
  if (!SITES[d.site]) throw new Error(`Unknown site ${d.site}`);
  const design = resolveDesign(catalog, d.counts);
  const init: GameInit = { siteId: d.site, seed: 1, settings: { parcelAcres: d.acres, startDay: 90 } };
  const base = initGame(catalog, getSite(d.site), init.settings, init.seed);
  const game = placeDesign(catalog, base, design.counts);
  const actions: Action[] = [];
  useGame.getState().loadGame(init, actions, game, { readOnly: true });
  return d.name;
}

/** Leave read-only mode with a copy the player owns (its layout becomes the start). */
export function copySharedDesign(): void {
  const s = useGame.getState();
  const actions: Action[] = s.game.instances.map((i) => ({
    at: s.game.calendar.absDay,
    kind: 'insert' as const,
    instance: i,
    cashDelta: 0,
  }));
  const base = initGame(catalog, getSite(s.init.siteId), s.init.settings, s.init.seed);
  s.loadGame(s.init, actions, { ...s.game, instances: s.game.instances, cash: base.cash });
}
