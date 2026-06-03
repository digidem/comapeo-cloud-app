import type { Preview } from '@storybook/tanstack-react';

import type { ReactNode } from 'react';
import { IntlProvider } from 'react-intl';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ShellSlotProvider } from '@/components/layout/shell-slot';
import { SUPPORTED_LOCALES, getMessages } from '@/i18n/load-messages';
import type { Locale } from '@/stores/locale-store';

// Import the app's global styles (Tailwind v4 + design tokens)
import '../src/app/styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, gcTime: 0 },
    mutations: { retry: false },
  },
});

function StorybookProviders({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const messages = getMessages(locale);
  return (
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale={locale} defaultLocale="en" messages={messages}>
        <ShellSlotProvider>{children}</ShellSlotProvider>
      </IntlProvider>
    </QueryClientProvider>
  );
}

const preview: Preview = {
  globalTypes: {
    locale: {
      name: 'Locale',
      description: 'i18n locale for stories',
      defaultValue: 'en',
      toolbar: {
        icon: 'globe',
        items: SUPPORTED_LOCALES.map((l) => ({
          value: l,
          title: { en: 'English', pt: 'Português', es: 'Español' }[l] ?? l,
        })),
      },
    },
    theme: {
      name: 'Theme',
      description: 'Color theme for stories (matches the app theme store)',
      defaultValue: 'light',
      toolbar: {
        icon: 'circlehollow',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
      },
    },
  },
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
    viewport: {
      viewports: {
        mobile: {
          name: 'Mobile (375×812)',
          styles: { width: '375px', height: '812px' },
        },
        tablet: {
          name: 'Tablet (768×1024)',
          styles: { width: '768px', height: '1024px' },
        },
        desktop: {
          name: 'Desktop (1440×900)',
          styles: { width: '1440px', height: '900px' },
        },
      },
      defaultViewport: 'mobile',
    },
  },
  decorators: [
    (Story, context) => (
      <StorybookProviders locale={(context.globals.locale ?? 'en') as Locale}>
        <ThemeProvider theme={(context.globals.theme ?? 'light') as Theme}>
          <Story />
        </ThemeProvider>
      </StorybookProviders>
    ),
  ],
};

const SUPPORTED_THEMES = ['light', 'dark'] as const;
type Theme = (typeof SUPPORTED_THEMES)[number];

/**
 * Preview decorator: applies the global `theme` arg to the document so the
 * existing `[data-theme='dark']` CSS in src/app/styles.css takes effect.
 * Mirrors what the app's useThemeStore does at runtime — see
 * src/stores/theme-store.ts.
 */
function ThemeProvider({
  theme,
  children,
}: {
  theme: Theme;
  children: ReactNode;
}) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }
  return <>{children}</>;
}

export default preview;
