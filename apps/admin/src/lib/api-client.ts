import { contract } from "carrier-contracts/contract";

import { createORPCClient, onError } from "@orpc/client";
import { type ContractRouterClient } from "@orpc/contract";
import type { JsonifiedClient } from "@orpc/openapi-client";
import { OpenAPILink } from "@orpc/openapi-client/fetch";

type ClientContext = {
  apiToken?: string;
};

declare const __API_URL__: string | undefined;

const apiUrl =
  (typeof __API_URL__ !== "undefined" && __API_URL__) ||
  "http://localhost:6021/api";

const link = new OpenAPILink<ClientContext>(contract, {
  fetch: (request, init) =>
    globalThis.fetch(request, {
      ...init,
      credentials: "include",
    }),
  headers: async ({ context }) => {
    if (context?.apiToken && context.apiToken.startsWith("ndt_")) {
      return { Authorization: `Bearer ${context.apiToken}` };
    }
    return {};
  },
  interceptors: [
    onError((error) => {
      console.error("[api]", error);
    }),
  ],
  url: apiUrl,
});

export const client: JsonifiedClient<ContractRouterClient<typeof contract>> =
  createORPCClient(link);
