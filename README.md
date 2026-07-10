# carrier

## Prerequisites

- [Bun](https://bun.com/) 1.3 or newer
- [Go](https://go.dev/) 1.26 or newer
- [Just](https://just.systems/)
- Docker with Compose support for container workflows

## Setup

Install the Bun workspace dependencies from the repository root:

```bash
bun install --frozen-lockfile
```

## Verification

Run the complete clean-checkout verification gate:

```bash
just verify
```

The recipe builds `carrier-contracts`, typechecks the contracts and all Bun
applications, runs the Bun source tests, and then runs the Go game-server
tests. Generated contract tests under `packages/contracts/dist` are excluded
from test discovery.

## Docker Compose

Two root-level compose files define the supported container workflows:

- `docker-compose.yml` is the production-style stack. It serves the client at `/`, admin at `/admin`, proxies the API at `/api`, and exposes the game server on port `6030`.
- `docker-compose.dev.yml` is the live-reload development stack. It bind-mounts the repo, runs the Bun services in dev mode, includes Nginx at `http://localhost:8080`, and includes the game server without Go autoreload.
- In both compose modes, the API database is stored in the repo at `./data/carrier.sqlite` via `API_DB_PATH`, so data persists outside the container filesystem.

`GAME_EXPORT_MAP_ID` is required in both modes because the game server needs an exported map ID to boot.

Production-style local verification:

```bash
GAME_EXPORT_MAP_ID=export-1 docker compose up --build
```

Development:

```bash
GAME_EXPORT_MAP_ID=export-1 docker compose -f docker-compose.dev.yml up --build
```

With the dev stack running, use:

- `http://localhost:8080/` for the client through Nginx
- `http://localhost:8080/admin/` for the admin through Nginx
- `http://localhost:6030/health` for the game server

The direct Bun dev ports (`5178`, `5179`, `6021`) remain exposed for debugging.

Convenience `just` recipes:

- `just dev` / `just dev-up-d` for the dev compose stack
- `just prod` / `just prod-up-d` for the production-style compose stack
- `just dev-down`, `just prod-down`, `just dev-logs`, `just prod-logs`
- `just dev-local` keeps the older manual API + client workflow

Recipes that start or build the full stack require `GAME_EXPORT_MAP_ID` in your environment.

Optional production env:

- `APP_ORIGIN` overrides the browser origin forwarded into the API's `TRUSTED_ORIGINS`. It defaults to `http://localhost:8080`.

## Docs

- Vehicle feature planning: [docs/vehicles-plan.md](docs/vehicles-plan.md)
