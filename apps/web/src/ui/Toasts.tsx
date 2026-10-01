import { useGame } from '../store/game.ts';

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`} role="status">
          {t.tone === 'warn' && <span aria-hidden="true">⚠ </span>}
          {t.text}
          {t.resource && (
            <button className="link" onClick={() => useGame.getState().openResource(t.resource!)} data-testid="toast-where-from">
              Where from?
            </button>
          )}
          {t.instanceId && (
            <button className="link" onClick={() => useGame.getState().focusInstance(t.instanceId!)}>
              Show on map
            </button>
          )}
          <button className="btn ghost" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
