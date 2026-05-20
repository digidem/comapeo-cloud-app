import type { StorybookConfig } from '@storybook/tanstack-react';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import type { InlineConfig } from 'vite';

const mocksDir = fileURLToPath(
  new URL('../src/screens/stories/__mocks__/', import.meta.url),
);

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-docs'],
  framework: '@storybook/tanstack-react',
  core: {
    disableTelemetry: true,
  },

  async viteFinal(baseConfig) {
    // Strip VitePWA and archive-api-proxy plugins — they conflict with Storybook
    const safePlugins = (baseConfig.plugins ?? []).flat().filter((p) => {
      const name =
        p && typeof p === 'object' && 'name' in p
          ? (p as { name: string }).name
          : '';
      return (
        !name.startsWith('vite-plugin-pwa') &&
        !name.startsWith('archive-api-proxy')
      );
    });

    // Build a clean config that replaces the base entirely
    const storybookConfig: InlineConfig = {
      ...baseConfig,
      plugins: [...safePlugins, react(), tailwindcss()],
      resolve: {
        ...baseConfig.resolve,
        alias: {
          ...(baseConfig.resolve?.alias instanceof Array
            ? Object.fromEntries(
                baseConfig.resolve.alias.map((a) => [a.find, a.replacement]),
              )
            : (baseConfig.resolve?.alias as
                | Record<string, string>
                | undefined)),
          '@': fileURLToPath(new URL('../src', import.meta.url)),
          '@tests': fileURLToPath(new URL('../tests', import.meta.url)),
          // Mock Zustand stores with controllable state
          '@/stores/project-store': `${mocksDir}stores.ts`,
          '@/stores/auth-store': `${mocksDir}stores.ts`,
          // Mock data-fetching hooks with fixture data
          '@/hooks/useProjects': `${mocksDir}hooks.ts`,
          '@/hooks/useObservations': `${mocksDir}hooks.ts`,
          '@/hooks/useAlerts': `${mocksDir}hooks.ts`,
          '@/hooks/useCreateAlert': `${mocksDir}hooks.ts`,
          '@/hooks/useArchiveStatus': `${mocksDir}hooks.ts`,
          '@/hooks/useProjectCoverage': `${mocksDir}hooks.ts`,
          '@/hooks/useRemoteArchives': `${mocksDir}hooks.ts`,
          // Mock API client and data layer
          '@/lib/api-client': `${mocksDir}api-client.ts`,
          '@/lib/data-layer': `${mocksDir}data-layer.ts`,
          '@/lib/invite-url': `${mocksDir}invite-url.ts`,
          '@/lib/geojson-export': `${mocksDir}geojson-export.ts`,
        },
      },
      // Remove build config that conflicts with Storybook
      build: {
        ...baseConfig.build,
        // Don't use manual chunks in Storybook
        rollupOptions: undefined,
      },
    };

    return storybookConfig;
  },
};

export default config;
