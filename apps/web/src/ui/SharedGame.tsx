import { useEffect, useState } from 'react';
import type { DayLedger } from '@homestead/engine';
import type { SharedSnapshot } from '../../../server/src/protocol.ts';
import { App } from '../App.tsx';
import { useGame } from '../store/game.ts';

class ServiceError extends Error {}
async function checked(response: Response) {
  if (!response.ok) {
    if (response.headers.get('content-type')?.includes('application/json')) {
      const data = (await response.json()) as { error: string };
      throw new ServiceError(data.error);
    }
    throw new ServiceError('The shared game service is unavailable.');
  }
  return response;
}
function errorText(error: unknown) {
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
  useEffect(() => {
    const controller = new AbortController();
    const base = `/api/rooms/${encodeURIComponent(roomId)}`;
    const headers = { Authorization: `Bearer ${token}` };
    let revision = -1;
    let live = false;
    let queue = Promise.resolve();
    let history: DayLedger[] = [];
    let historyLimit = 90;
    const ledgers = (current: DayLedger[]) => {
      history = [...new Map([...history, ...current].map((l) => [l.absDay, l])).values()]
        .sort((a, b) => a.absDay - b.absDay)
        .slice(-historyLimit);
      return history;
    };
    const receive = (update: SharedSnapshot) => {
      if (controller.signal.aborted || update.revision <= revision) return;
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
    const send = (path: string, data: unknown) => {
      if (!live) {
        setError('Connect to the shared game before editing.');
        return;
      }
      queue = queue.then(async () => {
        try {
          const response = await checked(
            await fetch(base + path, {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
              signal: controller.signal,
            }),
          );
          receive((await response.json()) as SharedSnapshot);
          setError('');
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          if (!controller.signal.aborted) setError(errorText(err));
        }
      });
    };
    useGame.setState({
      multiplayer: {
        send: (commands) => send('/commands', { requestId: crypto.randomUUID(), commands }),
        control: (ready) => send('/control', { ready }),
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
        live = true;
        setConnected(true);
        setError('');
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
            if (line.trim()) receive(JSON.parse(line) as SharedSnapshot);
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setError(errorText(err));
          setConnected(false);
        }
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
          if (err instanceof DOMException && err.name === 'TimeoutError')
            setError('Connection timed out. Reconnect before editing.');
          else setError(errorText(err));
          live = false;
          setConnected(false);
          controller.abort();
        }
      })();
    }, 2000);
    void connect();
    return () => {
      unsubscribe();
      window.clearInterval(heartbeat);
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
            is held in memory; refresh recovery and durable saves are coming in MP-03.
          </p>
        </details>
        {!snapshot?.running && <span data-testid="shared-pause">{snapshot?.pauseReason}</span>}
        {error && <span role="alert">{error}</span>}
        {!connected && <button onClick={() => setAttempt((n) => n + 1)}>Reconnect</button>}
      </section>
      {snapshot ? <App /> : <p>Connecting to the authoritative homestead…</p>}
    </div>
  );
}
