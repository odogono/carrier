set dotenv-load := true

# Place help first so `just` runs it by default
help:
    @just --list

# Build shared contracts, typecheck Bun apps, and run all Bun and Go tests
verify:
  bun run --cwd packages/contracts build
  bun run --cwd packages/contracts typecheck
  bun run --cwd apps/api typecheck
  bun run --cwd apps/admin typecheck
  bun run --cwd apps/client typecheck
  bun test --path-ignore-patterns packages/contracts/dist
  go test ./apps/game/...

dev-local:
  bun run --cwd apps/api dev &
  bun run --cwd apps/client dev

dev:
  GAME_EXPORT_MAP_ID="{{ env_var('GAME_EXPORT_MAP_ID') }}" docker compose -f docker-compose.dev.yml up --build

dev-up:
  GAME_EXPORT_MAP_ID="{{ env_var('GAME_EXPORT_MAP_ID') }}" docker compose -f docker-compose.dev.yml up

dev-up-d:
  GAME_EXPORT_MAP_ID="{{ env_var('GAME_EXPORT_MAP_ID') }}" docker compose -f docker-compose.dev.yml up --build -d

dev-build:
  GAME_EXPORT_MAP_ID="{{ env_var('GAME_EXPORT_MAP_ID') }}" docker compose -f docker-compose.dev.yml build

dev-stop:
  docker compose -f docker-compose.dev.yml stop

dev-down:
  docker compose -f docker-compose.dev.yml down

dev-logs *services:
  docker compose -f docker-compose.dev.yml logs -f {{ services }}

dev-ps:
  docker compose -f docker-compose.dev.yml ps

prod:
  GAME_EXPORT_MAP_ID="{{ env_var('GAME_EXPORT_MAP_ID') }}" docker compose up --build

prod-up:
  GAME_EXPORT_MAP_ID="{{ env_var('GAME_EXPORT_MAP_ID') }}" docker compose up

prod-up-d:
  GAME_EXPORT_MAP_ID="{{ env_var('GAME_EXPORT_MAP_ID') }}" docker compose up --build -d

prod-build:
  GAME_EXPORT_MAP_ID="{{ env_var('GAME_EXPORT_MAP_ID') }}" docker compose build

prod-stop:
  docker compose stop

prod-down:
  docker compose down

prod-logs *services:
  docker compose logs -f {{ services }}

prod-ps:
  docker compose ps
