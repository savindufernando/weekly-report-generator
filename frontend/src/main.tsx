import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import App from './App';
import { ApiError } from './services/api';
import { AuthProvider } from './contexts/AuthContext';
import { SnackbarProvider } from './contexts/SnackbarContext';
import { ThemeModeProvider } from './contexts/ThemeModeContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Retrying a 4xx is pointless load that only delays the error the user
      // needs to see. A 5xx is worth a couple of attempts.
      retry: (failureCount, error) =>
        error instanceof ApiError && error.status >= 400 && error.status < 500
          ? false
          : failureCount < 2,
    },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeModeProvider>
      <QueryClientProvider client={queryClient}>
        <SnackbarProvider>
          {/* AuthProvider needs the query client to clear the cache on logout. */}
          <AuthProvider>
            <App />
          </AuthProvider>
        </SnackbarProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </ThemeModeProvider>
  </StrictMode>,
);
