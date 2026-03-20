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

Override E2E ports with `E2E_ADMIN_PORT` / `E2E_API_PORT`. Playwright sets `PUBLIC_API_URL` on the admin process (overriding `dev.defaults.env`) so the app calls the e2e API; the API process gets `API_PORT` and `TRUSTED_ORIGINS=http://localhost:<E2E_ADMIN_PORT>` for CORS.

Point tests at an existing admin URL with `PLAYWRIGHT_BASE_URL` (and start servers yourself; set `CI=1` to skip `reuseExistingServer` behavior if you need strict isolation).

## E2E config

- `playwright.config.ts` — `webServer` starts `../api` (e2e `API_PORT`) and admin via `bun ./index.html --port=<E2E_ADMIN_PORT>` with `PUBLIC_API_URL` set.
- `bunfig.toml` — `[serve.static] env = "PUBLIC_*"` so `PUBLIC_API_URL` is inlined in the dev bundle.
