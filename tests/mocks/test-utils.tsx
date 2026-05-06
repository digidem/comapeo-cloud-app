import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

function TestProviders({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en" defaultLocale="en">
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
