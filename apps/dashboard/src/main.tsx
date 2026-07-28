import { restoreSession } from '@madiro/web-core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { initI18n } from './i18n';
import { routeTree } from './routeTree.gen';
import './styles.css';

initI18n();

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Short staleTime damps refetch storms when a mutation invalidates a broad key.
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// The access token is memory-only now (audit S-H3), so a reload starts without
// one. Spend the httpOnly refresh cookie first and mount only then — otherwise
// the route guard would bounce a perfectly valid session to the login screen.
void restoreSession().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
});
