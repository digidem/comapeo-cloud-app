import type { Preview } from '@storybook/tanstack-react';

import { type ReactNode, useEffect } from 'react';
import { IntlProvider } from 'react-intl';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router';

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

type Theme = 'light' | 'dark';
const SUPPORTED_THEMES: readonly Theme[] = ['light', 'dark'];

/**
 * Preview decorator: applies the global `theme` arg to the document so the
 * existing `[data-theme='dark']` CSS in src/app/styles.css takes effect.
 * Mirrors what the app's useThemeStore does at runtime — see
 * src/stores/theme-store.ts.
 *
 * The DOM mutations live in a useEffect so they don't run during the render
 * phase (the React rules: a render must be a pure function of props and
 * state, with no side effects). The effect re-runs when the theme changes,
 * and the cleanup function reverts the document when the Storybook
 * preview unmounts (e.g., when the user navigates to a different story).
 */
function ThemeProvider({
  theme,
  children,
}: {
  theme: Theme;
  children: ReactNode;
}) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const previousTheme = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    return () => {
      // Restore on unmount: drop back to the default 'light' theme so a
      // subsequent story that doesn't set a theme doesn't inherit the
      // previous story's dark background by accident.
      document.documentElement.setAttribute(
        'data-theme',
        previousTheme ?? 'light',
      );
      document.documentElement.classList.remove('dark');
    };
  }, [theme]);
  return <>{children}</>;
}

/**
 * Minimal TanStack Router instance for Storybook.  Provides just enough
 * context so that hooks like useParams / useLocation / useMatch resolve
 * without crashing.  Individual stories can override route state via
 * parameters or args when they need specific values.
 */
const rootRoute = createRootRoute({ component: Outlet });
const storybookRouter = createRouter({
  routeTree: rootRoute,
  defaultPreload: false,
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
        <RouterProvider router={storybookRouter}>
          <ShellSlotProvider>{children}</ShellSlotProvider>
        </RouterProvider>
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
        items: SUPPORTED_THEMES.map((t) => ({
          value: t,
          title: t.charAt(0).toUpperCase() + t.slice(1),
        })),
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

export default preview;
