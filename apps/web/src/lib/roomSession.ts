// Per-tab credentials survive refresh without leaking a seat through an invitation URL.
export class SessionError extends Error {}
export interface PendingRequest {
  requestId: string;
  commands: unknown[];
}
export interface RoomSession {
  token: string;
  pending: PendingRequest[];
}
const key = (roomId: string) => `terra-room-v1:${roomId}`;
function sessionFailure(error: unknown): never {
  if (error instanceof DOMException)
    throw new SessionError(
      'Browser session storage is unavailable. Enable site storage before joining or editing; your reconnect credential could not be saved.',
    );
  throw error;
}
export function readRoomSession(roomId: string): RoomSession | null {
  let value: string | null;
  try {
    value = sessionStorage.getItem(key(roomId));
  } catch (error) {
    return sessionFailure(error);
  }
  if (!value) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new SessionError(
      'This tab’s saved room credential is unreadable. Contact the host owner; a new seat has not been claimed.',
    );
  }
  const session = parsed as Partial<RoomSession> | null;
  if (
    !session ||
    typeof session.token !== 'string' ||
    !/^[A-Za-z0-9_-]{32}$/.test(session.token) ||
    !Array.isArray(session.pending) ||
    session.pending.length > 50 ||
    session.pending.some(
      (p) =>
        !p ||
        typeof p.requestId !== 'string' ||
        !/^[A-Za-z0-9_-]{16,80}$/.test(p.requestId) ||
        !Array.isArray(p.commands),
    )
  )
    throw new SessionError(
      'This tab’s saved reconnect data is invalid. Contact the host owner; a new seat has not been claimed.',
    );
  return session as RoomSession;
}
export function writeRoomSession(roomId: string, session: RoomSession) {
  try {
    sessionStorage.setItem(key(roomId), JSON.stringify(session));
  } catch (error) {
    sessionFailure(error);
  }
}
