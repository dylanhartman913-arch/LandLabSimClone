import { afterEach } from 'vitest';

// Bot simulations are long and synchronous. Without a turn of the event loop between tests, a file's
// progress messages to the main process queue up until the whole file ends, and a file over a minute
// trips Vitest's RPC timeout ("Timeout calling onTaskUpdate").
afterEach(() => new Promise<void>((resolve) => setImmediate(resolve)));
