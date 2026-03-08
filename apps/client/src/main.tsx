import { StrictMode } from 'react';

import { createRoot } from 'react-dom/client';

import './index.css';

import { ThemeProvider } from '@/contexts/theme/provider';
import { Main } from '@/screens/main';

import { QueryProvider } from './contexts/query/provider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <ThemeProvider>
        <Main />
      </ThemeProvider>
    </QueryProvider>
  </StrictMode>
);
