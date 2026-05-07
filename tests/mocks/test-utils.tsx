import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

// Flatten { id: { defaultMessage: string } } to { id: string } for IntlProvider
const flatMessages: Record<string, string> = {};
for (const [key, value] of Object.entries(enMessages)) {
  flatMessages[key] = (value as { defaultMessage: string }).defaultMessage;
}

function TestProviders({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en" defaultLocale="en" messages={flatMessages}>
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
