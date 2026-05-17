import { IntlProvider } from 'react-intl';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';

import { router } from '@/app/router';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { ToastProvider } from '@/components/ui/toast';
import { getMessages } from '@/i18n/load-messages';
import { useLocaleStore } from '@/stores/locale-store';

const queryClient = new QueryClient();

export function AppProviders() {
  const locale = useLocaleStore((s) => s.locale);
  const messages = getMessages(locale);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <IntlProvider locale={locale} defaultLocale="en" messages={messages}>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </IntlProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
