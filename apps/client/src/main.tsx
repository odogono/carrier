import { StrictMode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';

import './index.css';

import { ThemeProvider } from '@/contexts/theme/provider';
import { Main } from '@/screens/main';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 10 * 60_000,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 60_000
    }
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Main />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
);
