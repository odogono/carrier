import { contract } from 'carrier-contracts/contract';
import { createLog } from 'odgn-ts-helpers/log';

import { createORPCClient, onError } from '@orpc/client';
import { type ContractRouterClient } from '@orpc/contract';
import type { JsonifiedClient } from '@orpc/openapi-client';
import { OpenAPILink } from '@orpc/openapi-client/fetch';

type ClientContext = {
  /**
   * API token for Bearer authentication.
   * Note: This should be an actual API token (starts with 'ndt_'), NOT a session token.
   * For session-based authentication, leave this undefined and rely on cookies.
   */
  apiToken?: string;
};

const log = createLog('client/api-link');

const apiUrl =
  (typeof __API_URL__ !== 'undefined' && __API_URL__) ||
  process.env.API_URL ||
  'http://localhost/api';

export { apiUrl };

const link = new OpenAPILink<ClientContext>(contract, {
  fetch: (request, init) =>
    globalThis.fetch(request, {
      ...init,
      credentials: 'include' // Include cookies for cross-origin requests (for session auth)
    }),
  headers: async ({ context }) => {
    // Only set Authorization header if we have an actual API token (not a session token)
    // API tokens start with 'ndt_' prefix
    if (context?.apiToken && context.apiToken.startsWith('ndt_')) {
      return { Authorization: `Bearer ${context.apiToken}` };
    }
    // For session-based auth, don't send Authorization header - use cookies instead
    return {};
  },
  interceptors: [
    onError(error => {
      log.error(error);
    })
  ],
  url: apiUrl
});

export const client: JsonifiedClient<ContractRouterClient<typeof contract>> =
  createORPCClient(link);

let healthCheckPromise:
  | Promise<Awaited<ReturnType<typeof client.helpers.healthCheck>>>
  | undefined;

export const connectApi = () => {
  if (healthCheckPromise) {
    return healthCheckPromise;
  }

  healthCheckPromise = client.helpers.healthCheck({}).then(response => {
    log.info('API health check succeeded', response);
    return response;
  });

  return healthCheckPromise;
};
