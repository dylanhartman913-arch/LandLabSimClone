/**
 * Tiny IndexedDB key-value store for saves. Every call is wrapped so a blocked
 * or missing IndexedDB (private windows, strict settings) reports an error the
 * UI can show instead of throwing.
 */
const DB = 'terra-homestead';
const STORE = 'saves';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB failed to open'));
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

export async function idbGet<T>(
  key: string,
): Promise<{ ok: true; value: T | undefined } | { ok: false; error: string }> {
  try {
    const db = await open();
    const value = await new Promise<T | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error ?? new Error('read failed'));
    });
    db.close();
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function idbSet(
  key: string,
  value: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('write failed'));
    });
    db.close();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
