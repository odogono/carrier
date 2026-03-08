import React, { useEffect, useState } from 'react';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';

import { TEN_MINUTES } from 'odgn-ts-helpers/time';

const ReactQueryDevtoolsProduction = React.lazy(() =>
  import('@tanstack/react-query-devtools/build/modern/production.js').then(
    (d) => ({
      default: d.ReactQueryDevtools,
    }),
  ),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: TEN_MINUTES,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30_000),
      staleTime: 30_000,
    },
  },
});

// Create a persister using localStorage
const localStoragePersister = createAsyncStoragePersister({
  key: 'carrier-admin-query-cache',
  storage: window.localStorage,
});

const persistOptions = {
  buster: 'carrier-admin-2026-03-08',
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { queryKey: readonly unknown[]; state: { status: string } }) => {
      if (query.queryKey[0] === 'map-chunk') return false;
      return query.state.status === 'success';
    },
  },
  persister: localStoragePersister,
};

export const QueryProvider = ({ children }: { children: React.ReactNode }) => {
  const [showDevtools, setShowDevtools] = useState(false);

  // calling window.toggleDevtools() will download the devtools bundle and show them
  useEffect(() => {
    // @ts-expect-error
    window.toggleDevtools = () => setShowDevtools((old) => !old);
  }, []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}>
      {children}
      <ReactQueryDevtools buttonPosition="bottom-left" initialIsOpen={false} />
      {showDevtools && (
        <React.Suspense fallback={null}>
          <ReactQueryDevtoolsProduction />
        </React.Suspense>
      )}
    </PersistQueryClientProvider>
  );
};
