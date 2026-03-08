import { StrictMode } from 'react';

import { RouterProvider } from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';

import './index.css';

import { ThemeProvider } from '@/contexts/theme/provider';
import { router } from '@/router';
import { QueryProvider } from '@/contexts/query/provider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <ThemeProvider>
        <RouterProvider router={router} />
        <Toaster />
      </ThemeProvider>
    </QueryProvider>
  </StrictMode>,
);
