# MP-01: Hosted room skeleton

Implemented locally; public HTTPS verification is pending hosting/repository access.

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

The nested `LandLabSimClone/.git` is the app repository. No remote was configured
when MP-01 was implemented. Connect the intended repository to the hosting account
before deployment. No hosting resources or paid plans have been provisioned.

`render.yaml` defines one Node web service using `npm ci && npm run build:hosted`,
`npm start`, and health path `/healthz`. Review the selected paid compute plan and
current price with the owner before provisioning. If the parent workspace is the
remote repository, select `LandLabSimClone/render.yaml` as the Blueprint path and
set `rootDir: LandLabSimClone` on its service. If the app repository itself is the
remote, keep the Blueprint at its root and leave `rootDir` unset.

Provider reference: [Render Blueprint specification](https://render.com/docs/blueprint-spec).

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
