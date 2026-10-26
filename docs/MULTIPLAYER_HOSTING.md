# MP-01: Hosted room skeleton

Implemented and tested locally. GitHub origin is connected and the public push is approved. Git CLI authentication and hosting connection are pending.

## Build and run

From `LandLabSimClone` with Node 22:

```sh
npm ci
npm run build:hosted
PORT=3000 npm start
```

Open `http://localhost:3000/`. The root serves the existing single-player game.
Choose **Multiplayer preview** to create a homestead with a guest name. Copy the
invitation field into a separate browser profile and join with a second name.
The lobby polls for seat updates every three seconds. A third guest sees **Room full**.
Unknown and expired links show an explicit invitation error.

`GET /healthz` returns readiness, engine version, and catalog source SHA-256.
Startup fails if the frontend build is missing. The server build bundles engine
and catalog TypeScript/JSON dependencies using the existing esbuild dependency;
production does not need a TypeScript runtime. The service binds `0.0.0.0:$PORT`.

## Deploy

The app repository is connected as `origin` to the public repository
[dylanhartman913-arch/LandLabSimClone](https://github.com/dylanhartman913-arch/LandLabSimClone).
The prepared local branch is `codex/mp-01-hosted-room`. It has not been pushed.
No hosting resources or paid plans have been provisioned. The owner prefers
free hosting and authorized at most $20 total for two months if necessary.

The remote default branch is `claude/gifted-hypatia-x158zw`. Local development
started with a separate source-snapshot history. The prepared branch preserves
both histories with a merge whose tree keeps the tested local files. It changes
approximately 480 files relative to that remote default: recent simulator work, MP-01, catalog
and source data, tests, documentation, and screenshot evidence. No files are
deleted relative to the remote default. Existing remote branches stay intact.
The publication includes local commit history, not only the latest MP-01 changes.

Commit `d4daff6` records 81 newly committed files/changes, including the latest
household, decision-display, and onboarding fixes plus MP-01. Commit `b82d50f`
connects that history to the remote baseline without changing the tested files.
Thirteen recent evidence images were included. Another 1,284 untracked screenshot
files remain local. The planning files in the parent workspace also remain local.

The owner approved this public branch and payload on October 26, 2026. The
approved push then failed because local Git has no GitHub credentials. Complete
the official GitHub CLI browser sign-in before retrying. No push has occurred.
Publish the prepared branch with:

```sh
git push --set-upstream origin codex/mp-01-hosted-room
```

For Render, connect this GitHub repository and select `codex/mp-01-hosted-room`.
The repository root is the app root: leave Root Directory unset. The Blueprint
path is `render.yaml`. It defines one Node web service using
`npm ci && npm run build:hosted`, `npm start`, and health path `/healthz`.
The Blueprint pins both the GitHub repository and multiplayer branch. The
`Hosted multiplayer skeleton` GitHub workflow verifies the bundled service and
three-browser invitation flow on branch pushes and pull requests. Automatic
Render deployments wait for passing CI checks.

The Blueprint uses the free compute plan for the MP-01 preview. Render free
services sleep after 15 minutes idle and cannot attach a persistent disk; room
seats currently disappear when the service restarts or spins down. This is a
preview, not durable competition hosting. Add durable storage with MP-03 before
relying on it for judging. Any paid fallback must fit the owner's $20 total
two-month limit, including storage and other charges; verify actual pricing
before provisioning. Do not enable automatic paid upgrades.

Provider references: [Render Blueprint specification](https://render.com/docs/blueprint-spec),
[free-service limits](https://render.com/docs/free).

After deployment, record the actual HTTPS URL here and verify:

- Root loads in a fresh browser without credentials.
- `/healthz` returns 200 with `ready: true`.
- Create a room, open its invitation from another device/network, join the second seat.
- Third visitor sees Room full; an invalid invite gives a readable error.
- Frontend assets load from the same origin as room API requests.

## Current boundary

This ticket creates rooms and claims seats; it does not run a shared simulation.
The existing game remains single-player. Multiplayer explicitly stays in a lobby.

Rooms are in memory, expire seven days after creation, and disappear on service
restart. There are at most 100 rooms per instance, two seats per room, 40-character
guest names, and 2 KiB JSON request bodies. Invitation IDs and separate seat tokens
use 192 random bits each. Public room responses never expose tokens. Seat reclaim,
WebSockets, action authority, rate limiting, durable storage, restart recovery,
and persistent-volume provisioning remain later multiplayer work. Refreshing a
lobby does not reclaim a seat yet; create a new preview room if needed. This is
not ready for competition submission or judging-period retention.

## Validation

Room integration tests cover static serving/readiness, concurrent seat claims,
full rooms, unknown/expired invites, invalid names/JSON, request size, cross-origin
claims, and capacity. A dedicated production-server Playwright configuration
exercises create/invite/join/full/invalid flows across separate browser contexts.
Run it after the production build with `npm run test:multiplayer`.

Local verification on October 26, 2026:

- Full unit suite: 76 files, 861 tests passed.
- Production-browser flow: 1 test passed across three isolated browser contexts.
- Typecheck, lint, and frontend/server production builds passed.
- Lobby screenshot inspected for layout/readability.

Public HTTPS acceptance remains unverified until the service is deployed.
