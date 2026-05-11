import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const vendorChunks: Record<string, string[]> = {
  'vendor-react': ['react', 'react-dom'],
  'vendor-tanstack': ['@tanstack/react-router', '@tanstack/react-query'],
  'vendor-ui': [
    '@radix-ui/react-dialog',
    '@radix-ui/react-dropdown-menu',
    '@radix-ui/react-select',
    '@radix-ui/react-separator',
    '@radix-ui/react-switch',
    '@radix-ui/react-tabs',
    '@radix-ui/react-toast',
    '@radix-ui/react-tooltip',
  ],
  'vendor-i18n': ['react-intl'],
  'vendor-form': ['react-hook-form', '@hookform/resolvers', 'valibot'],
};

export default defineConfig({
  server: {
    proxy: {
      // Proxy /api requests to the archive server in development to avoid CORS issues.
      // The api-client prepends /api when baseUrl is a remote URL in dev mode.
      // The target is determined dynamically via the x-target-url header.
      '/api': {
        target: 'http://placeholder',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // Read the target URL from the custom header set by the api-client
            const targetUrl = req.headers['x-target-url'] as string | undefined;
            if (targetUrl) {
              try {
                const parsed = new URL(targetUrl);
                proxyReq.setHeader('host', parsed.host);
              } catch {
                // Invalid URL, use default
              }
            }
          });
        },
        router: (req) => {
          // Dynamically route based on the x-target-url header
          const targetUrl = req.headers['x-target-url'] as string | undefined;
          if (targetUrl) {
            try {
              const parsed = new URL(targetUrl);
              return `${parsed.protocol}//${parsed.host}`;
            } catch {
              // Invalid URL, fall through to default
            }
          }
          return 'http://placeholder';
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,svg,png,html,webmanifest,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              networkTimeoutSeconds: 10,
            },
          },
          {
            urlPattern: ({ url, sameOrigin }) =>
              !sameOrigin && url.protocol === 'https:',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'remote-api-cache',
              expiration: {
                maxAgeSeconds: 60 * 60 * 24,
              },
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@tests': fileURLToPath(new URL('./tests', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    modulePreload: {
      polyfill: false,
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          for (const [chunkName, modules] of Object.entries(vendorChunks)) {
            if (modules.some((mod) => id.includes(mod))) {
              return chunkName;
            }
          }
        },
      },
    },
    minify: 'esbuild',
    cssCodeSplit: true,
  },
});
