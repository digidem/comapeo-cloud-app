import type { Preview } from '@storybook/tanstack-react';

import type { ReactNode } from 'react';
import { IntlProvider } from 'react-intl';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ShellSlotProvider } from '@/components/layout/shell-slot';
import { getMessages } from '@/i18n/load-messages';

// Import the app's global styles (Tailwind v4 + design tokens)
import '../src/app/styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, gcTime: 0 },
    mutations: { retry: false },
  },
});

const messages = getMessages('en');

function StorybookProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en" defaultLocale="en" messages={messages}>
        <ShellSlotProvider>{children}</ShellSlotProvider>
      </IntlProvider>
    </QueryClientProvider>
  );
}

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      test: 'todo',
    },
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <StorybookProviders>
        <Story />
      </StorybookProviders>
    ),
  ],
};

export default preview;
