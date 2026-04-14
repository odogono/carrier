export type PersistedQueryDescriptor = {
  queryKey: readonly unknown[];
  state: { status: string };
};

export const QUERY_CACHE_BUSTER =
  'carrier-client-2026-04-14-static-entity-revisioned-chunks';

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

  if (queryRoot === 'zarch' && query.queryKey[1] === 'tile-edit-config') {
    return false;
  }

  return true;
};
