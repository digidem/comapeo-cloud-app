import { IntlProvider } from 'react-intl';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';

import { router } from '@/app/router';
import enMessages from '@/i18n/messages/en.json';

const queryClient = new QueryClient();

// Convert { id: { defaultMessage: string } } to { id: string }
const flatMessages = {};
for (const [key, value] of Object.entries(enMessages)) {
  // @ts-expect-error - we know the structure
  flatMessages[key] = value.defaultMessage;
}

export function AppProviders() {
  return (
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en" messages={flatMessages}>
        <RouterProvider router={router} />
      </IntlProvider>
    </QueryClientProvider>
  );
}
