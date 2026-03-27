export type PersistedQueryDescriptor = {
  queryKey: readonly unknown[];
  state: { status: string };
};

export const QUERY_CACHE_BUSTER = 'carrier-client-2026-03-27-zarch-model-cache';

export const shouldPersistQuery = (query: PersistedQueryDescriptor) => {
  if (query.state.status !== 'success') {
    return false;
  }

  const queryRoot = query.queryKey[0];

  if (queryRoot === 'map-chunk') {
    return false;
  }

  if (queryRoot === 'zarch-runtime-entity-model') {
    return false;
  }

  return true;
};
