import { useEffect, useState } from 'react';
import type { DayLedger } from '@homestead/engine';
import type { SharedSnapshot } from '../../../server/src/protocol.ts';
import { readRoomSession, writeRoomSession, SessionError, type PendingRequest } from '../lib/roomSession.ts';
import { App } from '../App.tsx';
import { useGame } from '../store/game.ts';

class ServiceError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}
async function checked(response: Response) {
  if (!response.ok) {
    if (response.headers.get('content-type')?.includes('application/json')) {
      const data = (await response.json()) as { error: string };
      throw new ServiceError(data.error, response.status);
    }
    throw new ServiceError('The shared game service is unavailable.');
  }
  return response;
}
function errorText(error: unknown) {
  if (error instanceof SessionError) return error.message;
  if (error instanceof DOMException && error.name === 'TimeoutError')
    return 'Connection timed out. Reconnecting to check pending edits.';
  if (error instanceof ServiceError) return error.message;
  if (error instanceof TypeError)
    return 'Connection lost. The shared game is unavailable; check your network.';
  if (error instanceof SyntaxError)
    return 'The server sent an unreadable update. Reload after checking your connection.';
  throw error;
}

export function SharedGame({ roomId, token, invite }: { roomId: string; token: string; invite: string }) {
  const [snapshot, setSnapshot] = useState<SharedSnapshot | null>(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const base = `/api/rooms/${encodeURIComponent(roomId)}`;
    const headers = { Authorization: `Bearer ${token}` };
    let revision = -1;
    let live = false;
    let retryTimer: number | undefined;
    let pending: PendingRequest[] = [];
    let sending = false;
    const failConnection = (err: unknown) => {
      if (controller.signal.aborted) return;
      setError(errorText(err));
      live = false;
      setConnected(false);
      useGame.setState({ speed: 0 });
      controller.abort();
      if (err instanceof SessionError) return;
      retryTimer = window.setTimeout(
        () => setAttempt((n) => n + 1),
        Math.min(8000, 1000 * 2 ** Math.min(attempt, 3)),
      );
    };
    const retain = (requests: PendingRequest[]) => {
      writeRoomSession(roomId, { token, pending: requests });
      pending = requests;
      setPendingCount(requests.length);
    };
    try {
      const session = readRoomSession(roomId);
      if (!session || session.token !== token)
        throw new SessionError('The reconnect credential is missing from this tab. Reload before editing.');
      pending = session.pending;
      setPendingCount(pending.length);
    } catch (err) {
      const message = errorText(err);
      setError(message);
      useGame.setState({
        multiplayer: { send: () => setError(message), control: () => setError(message) }, speed: 0,
      });
      return () => useGame.setState({ multiplayer: null, speed: 0 });
    }
    let history: DayLedger[] = [];
    let historyLimit = 90;
    const ledgers = (current: DayLedger[]) => {
      history = [...new Map([...history, ...current].map((l) => [l.absDay, l])).values()]
        .sort((a, b) => a.absDay - b.absDay)
        .slice(-historyLimit);
      return history;
    };
    const receive = (update: SharedSnapshot) => {
      if (controller.signal.aborted) return;
      if (update.storageError) {
        setSnapshot(update);
        failConnection(new ServiceError(update.storageError, 503));
        return;
      }
      if (update.revision <= revision) return;
      revision = update.revision;
      useGame.setState({
        game: { ...update.game, ledgers: ledgers(update.game.ledgers) },
        init: update.init,
        actions: [],
        events: update.events,
        reports: update.reports,
        speed: update.running ? 1 : 0,
        lastTickAt: performance.now(),
        undoStack: [],
        redoStack: [],
        wizardOpen: false,
        daysSinceAutosave: 0,
      });
      setSnapshot(update);
    };
    const request = (path: string, data?: unknown) =>
      fetch(base + path, {
        ...(data === undefined ? {} : { method: 'POST', body: JSON.stringify(data) }),
        headers: { ...headers, 'Content-Type': 'application/json' },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      });
    const drain = async () => {
      if (sending || !live) return;
      sending = true;
      try {
        while (pending.length && live) {
          const edit = pending[0]!;
          // Resolve an ambiguous response using the durable outcome before considering a retry.
          const outcome = await request('/requests/' + edit.requestId);
          if (outcome.ok) {
            retain(pending.slice(1));
            continue;
          }
          if (outcome.status !== 404) await checked(outcome);
          try {
            const response = await checked(await request('/commands', edit));
            receive((await response.json()) as SharedSnapshot);
            retain(pending.slice(1));
          } catch (err) {
            if (!(err instanceof ServiceError) || ![400, 413, 422].includes(err.status)) throw err;
            retain(pending.slice(1));
            setError(err.message);
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        failConnection(err);
      } finally {
        sending = false;
      }
    };
    useGame.setState({
      multiplayer: {
        send: (commands) => {
          if (!live) {
            setError('Connect to the shared game before editing.');
            return;
          }
          if (pending.length >= 50) {
            setError('Wait for pending edits to be confirmed before editing again.');
            return;
          }
          try {
            retain([...pending, { requestId: crypto.randomUUID(), commands }]);
          } catch (err) {
            failConnection(err);
            return;
          }
          void drain();
        },
        control: (ready) => {
          if (!live) {
            setError('Connect to the shared game before changing time.');
            return;
          }
          if (ready && pending.length) {
            setError('Wait for pending edits to be confirmed before choosing Ready.');
            return;
          }
          void (async () => {
            try {
              const response = await checked(await request('/control', { ready }));
              receive((await response.json()) as SharedSnapshot);
            } catch (err) {
              if (controller.signal.aborted) return;
              if (err instanceof ServiceError && err.status === 422) setError(err.message);
              else failConnection(err);
            }
          })();
        },
      },
      speed: 0,
      readOnly: false,
      wizardOpen: false,
      panel: null,
    });
    const connect = async () => {
      try {
        const response = await checked(await fetch(base + '/stream', { headers, signal: controller.signal }));
        if (!response.body) throw new ServiceError('Streaming updates are unavailable in this browser.');

        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let pending = '';
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done)
            throw new ServiceError(
              'Disconnected from the shared game. Both players must choose Ready after reconnecting.',
            );
          pending += value;
          let newline: number;
          while ((newline = pending.indexOf('\n')) >= 0) {
            const line = pending.slice(0, newline);
            pending = pending.slice(newline + 1);
            if (line.trim()) {
              receive(JSON.parse(line) as SharedSnapshot);
              if (!live && !controller.signal.aborted) {
                live = true;
                setConnected(true);
                setError('');
                void drain();
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!controller.signal.aborted) failConnection(err);
      } finally {
        live = false;
      }
    };
    const unsubscribe = useGame.subscribe((state, previous) => {
      if (!state.checklistOpen || previous.checklistOpen) return;
      void (async () => {
        try {
          const response = await checked(
            await fetch(base + '/history', { headers, signal: controller.signal }),
          );
          const data = (await response.json()) as { ledgers: DayLedger[] };
          if (controller.signal.aborted) return;
          historyLimit = 730;
          ledgers(data.ledgers);
          useGame.setState((s) => ({ game: { ...s.game, ledgers: ledgers(s.game.ledgers) } }));
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          if (!controller.signal.aborted) {
            setError(errorText(err));
            useGame.getState().setChecklist(false);
          }
        }
      })();
    });
    const heartbeat = window.setInterval(() => {
      if (!live) return;
      void (async () => {
        try {
          await checked(
            await fetch(base + '/heartbeat', {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: '{}',
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
            }),
          );
        } catch (err) {
          if (controller.signal.aborted) return;
          failConnection(err);
        }
      })();
    }, 2000);
    void connect();
    return () => {
      unsubscribe();
      window.clearInterval(heartbeat);
      window.clearTimeout(retryTimer);
      controller.abort();
      useGame.setState({ multiplayer: null, speed: 0 });
    };
  }, [roomId, token, attempt]);
  return (
    <div className="shared-session">
      <section className="shared-bar" aria-label="Shared homestead">
        <span data-testid="shared-status">
          {connected ? 'Connected' : 'Disconnected'} · Revision {snapshot?.revision ?? '…'} ·{' '}
          {snapshot?.running ? 'Running · 1 day/second' : 'Paused'}
        </span>
        {snapshot?.players.map((p, i) => (
          <span key={i}>
            {p.name}: {p.connected ? (p.ready ? 'Ready' : 'Planning') : 'Disconnected'}
          </span>
        ))}
        <button onClick={() => useGame.getState().multiplayer?.control(false)}>Pause together</button>
        <button
          disabled={!connected || snapshot?.running}
          onClick={() => useGame.getState().multiplayer?.control(true)}
        >
          Ready to run
        </button>
        <details>
          <summary>Invite & room rules</summary>
          <label>
            Invite link <input readOnly value={invite} onFocus={(e) => e.target.select()} />
          </label>
          <p>
            Standard · Front Range · two simulated residents. Share costs and labor. Either can pause; both
            must be ready to resume. Survival alerts, construction and harvest pause everyone. Room progress
            is saved before edits are confirmed. Keep this tab to recover your seat after refresh. Reconnects
            pause everyone.
          </p>
        </details>
        {!snapshot?.running && <span data-testid="shared-pause">{snapshot?.pauseReason}</span>}
        {snapshot?.durable && !snapshot.storageError && connected && (
          <span data-testid="shared-save">Saved revision {snapshot.revision}</span>
        )}
        {pendingCount > 0 && <span role="status">{pendingCount} edit(s) awaiting confirmation</span>}
        {error && <span role="alert">{error}</span>}
        {!connected && <button onClick={() => setAttempt((n) => n + 1)}>Reconnect</button>}
      </section>
      {snapshot ? <App /> : <p>Connecting to the authoritative homestead…</p>}
    </div>
  );
}
