/** Per-viewer conveniences in localStorage (drawer open, tab). Never game state. */
export function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`homestead:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(`homestead:${key}`, JSON.stringify(value));
  } catch {
    // Storage unavailable (private window, blocked site data): preferences just don't persist.
  }
}
