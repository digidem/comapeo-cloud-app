import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router';

import { routeTree } from '@/app/router';
import enMessages from '@/i18n/messages/en.json';

// Create a fresh QueryClient for each test to prevent shared state
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

// Create a fresh router for each test to prevent shared state
function createTestRouter() {
  const memoryHistory = createMemoryHistory({
    initialEntries: ['/'],
  });
  return createRouter({
    routeTree,
    history: memoryHistory,
    context: {
      auth: { isAuthenticated: false },
    },
  });
}

function TestProviders({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient();
  const testRouter = createTestRouter();
  return (
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en" defaultLocale="en" messages={enMessages}>
        <RouterProvider router={testRouter} />
        {children}
      </IntlProvider>
    </QueryClientProvider>
  );
}

function customRender(ui: ReactElement) {
  return render(ui, { wrapper: TestProviders });
}

export * from '@testing-library/react';
export { customRender as render, userEvent };
