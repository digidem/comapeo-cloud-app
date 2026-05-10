import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { getMessages } from '@/i18n/load-messages';

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

function TestProviders({
  children,
  locale = 'en',
}: {
  children: React.ReactNode;
  locale?: string;
}) {
  const queryClient = createTestQueryClient();
  const messages = getMessages(locale);
  return (
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale={locale} defaultLocale="en" messages={messages}>
        {children}
      </IntlProvider>
    </QueryClientProvider>
  );
}

function customRender(ui: ReactElement, { locale }: { locale?: string } = {}) {
  return render(ui, {
    wrapper: ({ children }) => (
      <TestProviders locale={locale}>{children}</TestProviders>
    ),
  });
}

export * from '@testing-library/react';
export { customRender as render, userEvent };
