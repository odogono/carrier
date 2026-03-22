import { contract } from 'carrier-contracts/contract';

import { createORPCClient, onError } from '@orpc/client';
import { type ContractRouterClient } from '@orpc/contract';
import type { JsonifiedClient } from '@orpc/openapi-client';
import { OpenAPILink } from '@orpc/openapi-client/fetch';

type ClientContext = {
  apiToken?: string;
};

declare global {
  interface Window {
    __API_URL__?: string;
  }
}

type RuntimeGlobals = typeof globalThis & {
  __API_URL__?: string;
};

const runtimeGlobals = globalThis as RuntimeGlobals;

// Production: `build.ts` defines `__API_URL__` on the bundle. Dev: Playwright / `bun run dev`
// set `PUBLIC_API_URL` (see `dev.defaults.env`). Bun only inlines `process.env.PUBLIC_*` when
// referenced directly (`bunfig.toml` `[serve.static] env = "PUBLIC_*"`); reading through
// `globalThis.process` skips substitution and the client fell back to port 6021 during E2E.
const apiUrl =
  runtimeGlobals.__API_URL__ ||
  process.env.PUBLIC_API_URL ||
  'http://localhost:6021/api';

const link = new OpenAPILink<ClientContext>(contract, {
  fetch: (request, init) =>
    globalThis.fetch(request, {
      ...init,
      credentials: 'include'
    }),
  headers: async ({ context }) => {
    if (context?.apiToken && context.apiToken.startsWith('ndt_')) {
      return { Authorization: `Bearer ${context.apiToken}` };
    }
    return {};
  },
  interceptors: [
    onError(error => {
      console.error('[api]', error);
    })
  ],
  url: apiUrl
});

export const client: JsonifiedClient<ContractRouterClient<typeof contract>> =
  createORPCClient(link);
