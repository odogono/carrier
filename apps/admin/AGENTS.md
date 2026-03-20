# Carrier Admin — agent notes

## Layout

- Entry: `src/main.tsx`, styles `src/index.css`, router `src/router.tsx`.
- Bun + Tailwind: `bunfig.toml`, `build.ts`, `tsconfig.json`. Path alias `@/*` → `src/*`.

## Commands

- `bun run dev` — admin dev server (default port **5179**, see `bunfig.toml`; uses `dev.defaults.env` so `PUBLIC_API_URL` is always defined for Bun’s client bundle inliner).
- `bun run build` — production build to `dist/`.
- `bun run test` — unit tests (Bun test runner).
- `bun run test:e2e` — Playwright E2E (starts API + admin on **e2e ports** unless `CI` is set and servers are reused).
- `bun run test:e2e:ui` — Playwright UI mode.
- `bun run playwright:install` — download Chromium for Playwright (or `bunx playwright install`; use `--with-deps` on Linux CI).

E2E specs live under `e2e/` as `*.e2e.ts` so Bun’s test runner does not pick them up (Playwright uses `testMatch` in `playwright.config.ts`).

## Ports

| Context        | Admin | API  |
| -------------- | ----- | ---- |
| Normal `dev`   | 5179  | 6021 (client default in `src/lib/api-client.ts`) |
| Playwright E2E | 5279  | 16021 |

Override E2E ports with `E2E_ADMIN_PORT` / `E2E_API_PORT`. Playwright sets `PUBLIC_API_URL` on the admin process (overriding `dev.defaults.env`) so the app calls the e2e API; the API process gets `API_PORT`, `TRUSTED_ORIGINS=http://localhost:<E2E_ADMIN_PORT>`, and **`API_DB_PATH=:memory:`** so E2E never writes to `apps/api/.data/carrier.sqlite`.

Point tests at an existing admin URL with `PLAYWRIGHT_BASE_URL` (and start servers yourself; set `CI=1` to skip `reuseExistingServer` behavior if you need strict isolation).

**Reusing a manually started API** (local, when `CI` is unset and Playwright’s `reuseExistingServer` attaches to an existing process on the e2e port): that server uses **whatever `API_DB_PATH` it was started with**. For the same isolation as automated E2E, start it with `API_DB_PATH=:memory:` (or another dedicated path), plus matching `API_PORT` and `TRUSTED_ORIGINS`.

## E2E config

- `playwright.config.ts` — `webServer` starts `../api` (e2e `API_PORT`, in-memory DB) and admin with `dev.defaults.env` and `--port=<E2E_ADMIN_PORT>` plus `PUBLIC_API_URL`.
- `bunfig.toml` — `[serve.static] env = "PUBLIC_*"` so `PUBLIC_API_URL` is inlined in the dev bundle.
