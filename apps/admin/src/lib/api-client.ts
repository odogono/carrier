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
  process?: {
    env?: Record<string, string | undefined>;
  };
};

const runtimeGlobals = globalThis as RuntimeGlobals;

// Production: `build.ts` defines __API_URL__. Dev: `bun run dev` loads `dev.defaults.env`
// so `PUBLIC_API_URL` is always set (possibly empty); Bun inlines it when `bunfig.toml` has
// `[serve.static] env = "PUBLIC_*"`. Read both through `globalThis` so missing Bun defines
// degrade to the localhost fallback instead of throwing a browser `ReferenceError`.
const apiUrl =
  runtimeGlobals.__API_URL__ ||
  runtimeGlobals.process?.env?.PUBLIC_API_URL ||
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
