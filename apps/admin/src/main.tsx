import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';

import { RouterProvider } from '@tanstack/react-router';

import './index.css';

import { QueryProvider } from '@/contexts/query/provider';
import { ThemeProvider } from '@/contexts/theme/provider';
import { router } from '@/router';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <ThemeProvider>
        <RouterProvider router={router} />
        <Toaster />
      </ThemeProvider>
    </QueryProvider>
  </StrictMode>
);
