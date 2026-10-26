import { useEffect, useState } from 'react';
import './multiplayer.css';

interface Room {
  id: string;
  expiresAt: number;
  players: { name: string }[];
}
interface RoomResponse {
  room: Room;
  playerToken?: string;
  invitePath?: string;
}
class RoomError extends Error {}
async function request(path: string, name?: string, signal?: AbortSignal): Promise<RoomResponse> {
  const response = await fetch(
    path,
    name === undefined
      ? { signal }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
          signal,
        },
  );
  if (!response.ok) {
    if (response.headers.get('content-type')?.includes('application/json')) {
      const data = (await response.json()) as { error: string };
      throw new RoomError(data.error);
    }
    throw new RoomError('The room service is unavailable. Use the hosted TERRA URL and try again.');
  }
  return response.json() as Promise<RoomResponse>;
}
function failure(error: unknown): string {
  if (error instanceof RoomError) return error.message;
  if (error instanceof TypeError)
    return 'Cannot reach the room service. Check your connection and try again.';
  throw error;
}

export function Multiplayer() {
  const roomId = new URLSearchParams(location.search).get('room');
  const [room, setRoom] = useState<Room | null>(null);
  const [joined, setJoined] = useState(false);
  const [name, setName] = useState('');
  const [invite, setInvite] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!roomId) return;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const data = await request(`/api/rooms/${encodeURIComponent(roomId)}`, undefined, controller.signal);
        if (!controller.signal.aborted) {
          setRoom(data.room);
          setConnected(true);
          setError('');
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setConnected(false);
          setError(failure(err));
        }
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [roomId]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await request(
        roomId ? `/api/rooms/${encodeURIComponent(roomId)}/join` : '/api/rooms',
        name,
      );
      setRoom(data.room);
      setJoined(true);
      setConnected(true);
      const url = new URL(data.invitePath ?? `/?room=${data.room.id}`, location.origin);
      setInvite(url.href);
      // Keep the creator in the lobby while giving both browsers the same invitation route.
      history.replaceState(null, '', url);
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="multiplayer">
      <h1>Build a homestead together</h1>
      <p>Invite one teammate to share your land, budget, and household.</p>
      <p>
        <strong>Multiplayer preview:</strong> room invitations are available. Shared gameplay is still being
        built.
      </p>
      {error && <p role="alert">{error}</p>}
      {room && (
        <section aria-label="Room lobby">
          <h2>Your homestead lobby</h2>
          <p role="status">
            {connected ? 'Connected to room service' : 'Room service disconnected'} · {room.players.length}/2
            seats claimed
          </p>
          <ul>
            {room.players.map((player, i) => (
              <li key={i}>{player.name}</li>
            ))}
          </ul>
          <p>Room expires {new Date(room.expiresAt).toLocaleString()}.</p>
          {room.players.length === 2 && !joined && <p>Room full. This homestead already has two players.</p>}
        </section>
      )}
      {!joined && (!room || room.players.length < 2) && (
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Guest name{' '}
            <input
              required
              maxLength={40}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="nickname"
            />
          </label>
          <button disabled={busy || (!!roomId && !connected)}>
            {busy ? 'Connecting…' : roomId ? 'Join homestead' : 'Create homestead'}
          </button>
        </form>
      )}
      {joined && (
        <section>
          <label>
            Invite link <input readOnly value={invite} onFocus={(event) => event.target.select()} />
          </label>
          <p>Copy this link and send it to your teammate. Exactly two guest seats are available.</p>
        </section>
      )}
      <p>
        Preview rooms are kept in memory for up to seven days and expire when the service restarts. Rejoining
        a claimed seat is coming with save and reconnect support.
      </p>
      <a href="./">Return to single-player</a>
    </main>
  );
}
