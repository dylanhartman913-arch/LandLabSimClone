import { catalog, DEFAULT_SITE_ID } from '@homestead/catalog';
import {
  applyAction,
  startGame,
  stepDay,
  survivalAlerts,
  buildReport,
  displayDate,
  canPlace,
  recoveryRoute,
  type ActionBody,
  type GameInit,
  type GameEvent,
  type Report,
} from '@homestead/engine';
import { z } from 'zod';
import type { SharedSnapshot } from './protocol.ts';

export class CommandError extends Error {}
const text = z.string().min(1).max(120);
const number = z.number().finite().min(0).max(1_000_000);
const position = z.number().finite().min(0).max(10_000);
const job = z.enum([
  'gather-water',
  'gather-wood',
  'gather-food',
  'gather-soil',
  'gather-carbon',
  'construction',
  'upkeep',
  'employment',
]);
const object = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
// Every object is strict: replay identifiers, cash adjustments and settings never cross this boundary.
const command = z.discriminatedUnion('kind', [
  object({ kind: z.literal('recoveryRoute') }),
  object({
    kind: z.literal('place'),
    systemId: text,
    x: position,
    y: position,
    mode: z.enum(['buy', 'diy']),
  }),
  object({ kind: z.literal('remove'), id: text }),
  object({
    kind: z.literal('moveMany'),
    moves: z
      .array(object({ id: text, x: position, y: position }))
      .min(1)
      .max(50),
  }),
  object({ kind: z.literal('priority'), id: text, priority: z.number().int().min(1).max(5) }),
  object({ kind: z.literal('link'), id: text, resource: text, providerId: text.nullable() }),
  object({ kind: z.literal('hireConstruction'), id: text }),
  object({ kind: z.literal('buy'), resource: text, amount: number.positive() }),
  object({ kind: z.literal('standing'), resource: text, keepAbove: number, orderUpTo: number.optional() }),
  object({ kind: z.literal('service'), id: text, replace: z.boolean() }),
  object({
    kind: z.literal('sell'),
    resource: text,
    amount: number.positive(),
    keep: number,
    receive: text.optional(),
  }),
  object({ kind: z.literal('preserve'), id: text, resource: text.nullable(), keep: number }),
  object({ kind: z.literal('livestock'), id: text, operation: z.enum(['breed', 'cull', 'cancel']) }),
  object({ kind: z.literal('hatch'), id: text, operation: z.enum(['set', 'cancel']) }),
  object({ kind: z.literal('assignShelter'), id: text, shelterId: text.nullable() }),
  object({ kind: z.literal('closeShelter'), id: text, closed: z.boolean() }),
  object({ kind: z.literal('winterize'), id: text, protection: z.enum(['insulated', 'heated']).nullable() }),
  object({ kind: z.literal('role'), id: text, role: z.enum(['adult', 'child', 'elder']) }),
  object({
    kind: z.literal('finance'),
    operation: z.enum(['borrow', 'repay', 'insurance', 'reserve']),
    amount: number,
  }),
  object({ kind: z.literal('ui'), panel: z.enum(['almanac', 'report', 'market', 'work']) }),
  object({ kind: z.literal('workPriority'), job, value: z.number().int().min(1).max(5) }),
  object({ kind: z.literal('workCap'), job, value: number.nullable() }),
  object({
    kind: z.literal('autoGather'),
    resource: z.enum(['waterDays', 'woodWeeks', 'foodWeeks']),
    value: number,
  }),
  object({ kind: z.literal('constructionShare'), value: z.number().finite().min(0).max(1) }),
  object({ kind: z.literal('emergencyConstruction'), value: z.boolean() }),
]);
const envelope = object({
  requestId: z.string().regex(/^[A-Za-z0-9_-]{16,80}$/),
  commands: z.array(command).min(1).max(50),
});
export const ROOM_INIT: GameInit = {
  siteId: DEFAULT_SITE_ID,
  seed: 2026,
  start: { id: 'greenfield', difficulty: 'standard', household: 2 },
  settings: {
    householdCorrectness: true,
    safeRecovery: true,
    reuseIdleLabor: true,
    survivalShelterReturn: true,
    safeWaterFirst: true,
    employmentPriority: true,
    siteCrewRates: true,
    cashFloor: true,
    serviceWarmUp: true,
    tutorialInstructions: true,
  },
};
export interface Player {
  name: string;
  token: string;
  connection?: { send(snapshot: SharedSnapshot): void; close(): void };
  ready: boolean;
  lastSeen?: number;
  windowAt: number;
  requests: number;
  outcomes: Map<string, number>;
}
export class Simulation {
  game = startGame(catalog, ROOM_INIT);
  revision = 0;
  events: GameEvent[] = [];
  reports: Report[] = [];
  running = false;
  pauseReason = 'Plan together, then both choose Ready to run.';
  constructor(readonly players: Player[]) {}
  snapshot(includeRecentHistory = true): SharedSnapshot {
    // A fixed 90-day window supplies current charts and work totals; full history stays on the server.
    return {
      revision: this.revision,
      init: ROOM_INIT,
      game: { ...this.game, ledgers: this.game.ledgers.slice(includeRecentHistory ? -90 : -1) },
      events: this.events.slice(-100),
      reports: this.reports.slice(-12),
      running: this.running,
      pauseReason: this.pauseReason,
      players: this.players.map((p) => ({ name: p.name, connected: !!p.connection, ready: p.ready })),
    };
  }
  publish() {
    const snapshot = this.snapshot(false);
    for (const p of this.players) p.connection?.send(snapshot);
  }
  pause(reason: string) {
    this.running = false;
    this.pauseReason = reason;
    for (const p of this.players) p.ready = false;
  }
  control(player: Player, value: unknown) {
    const parsed = object({ ready: z.boolean() }).safeParse(value);
    if (!parsed.success) throw new CommandError('Choose Ready to run or Pause.');
    if (!parsed.data.ready) this.pause(`${player.name} paused the homestead.`);
    else {
      if (this.players.length !== 2 || this.players.some((p) => !p.connection))
        throw new CommandError('Both players must be connected before running.');
      player.ready = true;
      this.running = this.players.every((p) => p.ready);
      if (!this.running) this.pauseReason = `Waiting for both players to be ready.`;
    }
    this.revision++;
    this.publish();
  }
  execute(player: Player, value: unknown) {
    const parsed = envelope.safeParse(value);
    if (!parsed.success)
      throw new CommandError(
        'Unsupported command or invalid arguments. Cash, refunds and room settings are server controlled.',
      );
    const { requestId, commands } = parsed.data;
    if (player.outcomes.has(requestId))
      throw new CommandError(
        'This request was already applied. Check the current homestead before trying another edit.',
      );
    let game = this.game;
    for (const intent of commands) {
      if (intent.kind === 'recoveryRoute') {
        const route = recoveryRoute(game, catalog);
        if (!route?.actions.length)
          throw new CommandError('There is no recovery route to book in the current state.');
        for (const action of route.actions) {
          try {
            game = applyAction(catalog, game, { ...action, at: game.calendar.absDay });
          } catch (error) {
            if (!(error instanceof Error) || error.constructor !== Error) throw error;
            throw new CommandError(error.message);
          }
        }
        if (!Number.isFinite(game.cash) || game.cash < 0)
          throw new CommandError('The recovery route exceeds the shared budget.');
        continue;
      }
      let action: ActionBody;
      switch (intent.kind) {
        case 'place': {
          const sys = catalog.systems.find((s) => s.id === intent.systemId);
          if (!sys || ['Human Being', 'Land Title ($50k)', 'Sunlight', 'Rainfall'].includes(sys.name))
            throw new CommandError('The fixed household and natural resources cannot be purchased.');
          if (game.instances.length >= 500)
            throw new CommandError('This homestead has reached its 500-system limit.');
          action = { ...intent, id: `i${game.nextInstanceId}` };
          break;
        }
        case 'workPriority':
          action = {
            kind: 'settings',
            settings: {
              work: {
                ...game.settings.work,
                priorities: { ...game.settings.work?.priorities, [intent.job]: intent.value },
              },
            },
          };
          break;
        case 'workCap':
          action = {
            kind: 'settings',
            settings: {
              work: {
                ...game.settings.work,
                caps: { ...game.settings.work?.caps, [intent.job]: intent.value },
              },
            },
          };
          break;
        case 'autoGather':
          action = {
            kind: 'settings',
            settings: { autoGather: { ...game.settings.autoGather, [intent.resource]: intent.value } },
          };
          break;
        case 'constructionShare':
        case 'emergencyConstruction':
          action = { kind: 'settings', settings: { [intent.kind]: intent.value } };
          break;
        default:
          action = intent;
      }
      if ('id' in intent) {
        const inst = game.instances.find((i) => i.id === intent.id);
        if (!inst) throw new CommandError('That system no longer exists.');
        if (intent.kind === 'remove' && inst.person)
          throw new CommandError('The fixed household cannot be removed.');
      }
      if (intent.kind === 'link' && !catalog.resources.some((r) => r.name === intent.resource))
        throw new CommandError('Choose a catalog resource for this link.');
      if (
        intent.kind === 'link' &&
        intent.providerId !== null &&
        !game.instances.some((i) => i.id === intent.providerId)
      )
        throw new CommandError('That provider no longer exists.');
      if (intent.kind === 'moveMany') {
        if (new Set(intent.moves.map((m) => m.id)).size !== intent.moves.length)
          throw new CommandError('Duplicate move target.');
        // Validate the complete candidate layout; moveMany itself is a privileged replay operation.
        const moved = {
          ...game,
          instances: game.instances.map((i) => ({ ...i, ...intent.moves.find((m) => m.id === i.id) })),
        };
        for (const move of intent.moves) {
          const inst = moved.instances.find((i) => i.id === move.id);
          if (!inst) throw new CommandError('That system no longer exists.');
          const check = canPlace(catalog, moved, inst.systemId, move.x, move.y, [move.id]);
          if (!check.ok) throw new CommandError(check.reason);
        }
      }
      try {
        game = applyAction(catalog, game, { ...action, at: game.calendar.absDay });
      } catch (error) {
        // The existing engine reports rule rejections as plain Error. Programming/runtime errors escalate.
        if (!(error instanceof Error) || error.constructor !== Error) throw error;
        throw new CommandError(error.message);
      }
      if (!Number.isFinite(game.cash) || game.cash < 0)
        throw new CommandError('This edit exceeds the shared budget.');
    }
    // No awaits: each batch and tick commits atomically in Node's ordered event queue.
    this.game = game;
    this.revision++;
    player.outcomes.set(requestId, this.revision);
    if (player.outcomes.size > 1000) player.outcomes.delete(player.outcomes.keys().next().value!);
    this.publish();
  }
  tick() {
    if (!this.running) return;
    const result = stepDay(this.game, catalog);
    this.game = result.state;
    this.events = [...this.events, ...result.events].slice(-100);
    const d = displayDate(result.ledger.day, result.ledger.year);
    if (d.lastDayOfSeason) {
      const ledgers = this.game.ledgers.filter(
        (l) =>
          l.absDay > result.ledger.absDay - 100 &&
          displayDate(l.day, l.year).seasonStartDay === d.seasonStartDay,
      );
      this.reports = [
        ...this.reports,
        buildReport(this.game, catalog, 'season', ledgers, `${d.label} report`),
      ].slice(-12);
    }
    if (result.ledger.day === 364)
      this.reports = [
        ...this.reports,
        buildReport(
          this.game,
          catalog,
          'year',
          this.game.ledgers.filter((l) => l.year === result.ledger.year),
          `Year ${result.ledger.year + 1} report`,
        ),
      ].slice(-12);
    const alert = survivalAlerts(this.game, catalog).find((a) => a.group === 'now');
    const event = result.events.find(
      (e) =>
        e.kind === 'hardship' ||
        e.kind === 'built' ||
        e.kind === 'harvest' ||
        (e.kind === 'risk' && e.phase === 'warning'),
    );
    if (alert || event)
      this.pause(
        alert
          ? `Survival alert: ${alert.title}`
          : `Shared alert: ${event!.kind}. Review the homestead before resuming.`,
      );
    this.revision++;
    this.publish();
  }
}
