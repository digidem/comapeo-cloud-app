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
  addons: [
    '@storybook/addon-a11y',
    '@storybook/addon-docs',
    '@storybook/addon-vitest',
  ],
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

    // Vite 5+ requires resolve.alias to be an array of { find, replacement }.
    // The previous object-keyed form silently failed to apply during
    // `storybook build` (dev worked by accident), which is why #82 mock
    // aliases leaked through to the static bundle. See issue #82.
    const baseAliases: { find: string | RegExp; replacement: string }[] = [];
    if (Array.isArray(baseConfig.resolve?.alias)) {
      baseAliases.push(
        ...(baseConfig.resolve.alias as {
          find: string | RegExp;
          replacement: string;
        }[]),
      );
    } else if (baseConfig.resolve?.alias) {
      for (const [find, replacement] of Object.entries(
        baseConfig.resolve.alias as Record<string, string>,
      )) {
        baseAliases.push({ find, replacement });
      }
    }

    // Specific mock aliases first (Vite alias resolution is first-match-wins,
    // so the generic '@' from baseConfig must NOT shadow these).
    const storybookAliases = [
      // Mock Zustand stores with controllable state
      { find: '@/stores/project-store', replacement: `${mocksDir}stores.ts` },
      { find: '@/stores/auth-store', replacement: `${mocksDir}stores.ts` },
      // Mock data-fetching hooks with fixture data
      { find: '@/hooks/useProjects', replacement: `${mocksDir}hooks.ts` },
      { find: '@/hooks/useObservations', replacement: `${mocksDir}hooks.ts` },
      { find: '@/hooks/useAlerts', replacement: `${mocksDir}hooks.ts` },
      { find: '@/hooks/useCreateAlert', replacement: `${mocksDir}hooks.ts` },
      { find: '@/hooks/useArchiveStatus', replacement: `${mocksDir}hooks.ts` },
      {
        find: '@/hooks/useProjectCoverage',
        replacement: `${mocksDir}hooks.ts`,
      },
      { find: '@/hooks/useRemoteArchives', replacement: `${mocksDir}hooks.ts` },
      // Mock API client and data layer
      { find: '@/lib/api-client', replacement: `${mocksDir}api-client.ts` },
      { find: '@/lib/data-layer', replacement: `${mocksDir}data-layer.ts` },
      { find: '@/lib/invite-url', replacement: `${mocksDir}invite-url.ts` },
      {
        find: '@/lib/geojson-export',
        replacement: `${mocksDir}geojson-export.ts`,
      },
      // Mock authenticated image URL hook for AudioPlayer
      {
        find: '@/hooks/useAuthenticatedImageUrl',
        replacement: `${mocksDir}useAuthenticatedImageUrl.ts`,
      },
      // Bare-specifier fallbacks pinned here so Storybook does not silently
      // break if vite.config.ts ever removes them. Specific mocks above
      // still take precedence (first-match-wins).
      {
        find: '@',
        replacement: fileURLToPath(new URL('../src', import.meta.url)),
      },
      {
        find: '@tests',
        replacement: fileURLToPath(new URL('../tests', import.meta.url)),
      },
    ];

    // Drop '@' and '@tests' from base aliases so the explicit entries in
    // storybookAliases above don't get duplicated.
    const baseAliasesFiltered = baseAliases.filter(
      (a) => a.find !== '@' && a.find !== '@tests',
    );

    // Build a clean config that replaces the base entirely
    const storybookConfig: InlineConfig = {
      ...baseConfig,
      plugins: [...safePlugins, react(), tailwindcss()],
      resolve: {
        ...baseConfig.resolve,
        // Specific mocks first so they match before the generic '@' from
        // baseConfig. Vite 5+ resolve.alias is first-match-wins; if the
        // generic '@' → 'src/' comes first, it shadows every specific mock
        // and the static build falls back to the real code. See #82.
        alias: [...storybookAliases, ...baseAliasesFiltered],
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
