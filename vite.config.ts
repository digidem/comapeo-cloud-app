import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import httpProxy from 'http-proxy-3';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import {
  ARCHIVE_TARGET_HEADER,
  normalizeArchiveBaseUrl,
  shouldForwardArchiveHeader,
  stripApiPrefix,
  validateArchiveProxyRequest,
} from './src/lib/archive-proxy';

// Order matters: longer / more specific paths first so that substring
// matching doesn't misassign packages (e.g. '@radix-ui/react-dialog'
// must not match the 'react' entry).
const vendorChunks: Record<string, string[]> = {
  'vendor-ui': [
    '@radix-ui/react-dialog',
    '@radix-ui/react-dropdown-menu',
    '@radix-ui/react-select',
    '@radix-ui/react-separator',
    '@radix-ui/react-switch',
    '@radix-ui/react-tabs',
    '@radix-ui/react-toast',
    '@radix-ui/react-tooltip',
    '@radix-ui/primitive',
    '@radix-ui/number',
    '@radix-ui/react-arrow',
    '@radix-ui/react-collection',
    '@radix-ui/react-compose-refs',
    '@radix-ui/react-context',
    '@radix-ui/react-direction',
    '@radix-ui/react-dismissable-layer',
    '@radix-ui/react-focus-guards',
    '@radix-ui/react-focus-scope',
    '@radix-ui/react-id',
    '@radix-ui/react-popper',
    '@radix-ui/react-portal',
    '@radix-ui/react-presence',
    '@radix-ui/react-primitive',
    '@radix-ui/react-slot',
    '@radix-ui/react-use-callback-ref',
    '@radix-ui/react-use-controllable-state',
    '@radix-ui/react-use-escape-keydown',
    '@radix-ui/react-use-layout-effect',
    '@radix-ui/react-use-previous',
    '@radix-ui/react-use-size',
    '@radix-ui/react-visually-hidden',
    '@floating-ui/core',
    '@floating-ui/dom',
    '@floating-ui/react-dom',
    '@floating-ui/utils',
  ],
  'vendor-tanstack': [
    '@tanstack/react-router',
    '@tanstack/react-query',
    '@tanstack/history',
    '@tanstack/query-core',
    '@tanstack/router-core',
    '@tanstack/react-store',
    '@tanstack/store',
  ],
  'vendor-i18n': [
    'react-intl',
    '@formatjs/intl',
    '@formatjs/fast-memoize',
    '@formatjs/icu-messageformat-parser',
    '@formatjs/icu-skeleton-parser',
    'intl-messageformat',
  ],
  'vendor-form': ['react-hook-form', '@hookform/resolvers', 'valibot'],
  'vendor-sentry': [
    '@sentry/react',
    '@sentry/core',
    '@sentry/browser',
    '@sentry-internal/browser-utils',
  ],
  'vendor-map': ['@vis.gl/react-maplibre', 'maplibre-gl'],
  'vendor-state': ['zustand'],
  'vendor-react': ['react-dom', 'react', 'scheduler'],
};

function writeProxyError(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
) {
  if (res.headersSent || res.writableEnded) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ error: { code, message } }));
}

function isApiProxyUrl(url: string): boolean {
  const { pathname } = new URL(url, 'http://localhost');
  return pathname === '/api' || pathname.startsWith('/api/');
}

function archiveApiProxy(): Plugin {
  const createProxyServer =
    httpProxy.createProxyServer ??
    (httpProxy as unknown as { default: typeof httpProxy }).default
      .createProxyServer;
  const proxy = createProxyServer({
    changeOrigin: true,
    secure: false,
  });

  proxy.on('proxyReq', (proxyReq, req) => {
    for (const headerName of Object.keys(req.headers)) {
      if (
        headerName.toLowerCase() !== 'host' &&
        !shouldForwardArchiveHeader(headerName)
      ) {
        proxyReq.removeHeader(headerName);
      }
    }
    proxyReq.removeHeader(ARCHIVE_TARGET_HEADER);
  });

  proxy.on('proxyRes', (proxyRes) => {
    proxyRes.headers['cache-control'] = 'no-store';
  });

  proxy.on('error', (err, _req: IncomingMessage, res: ServerResponse) => {
    console.warn('[archive proxy] upstream request failed:', err.message);
    writeProxyError(
      res,
      502,
      'ARCHIVE_PROXY_UPSTREAM_FAILED',
      'Archive server request failed',
    );
  });

  return {
    name: 'archive-api-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !isApiProxyUrl(req.url)) {
          next();
          return;
        }

        const targetHeader = req.headers[ARCHIVE_TARGET_HEADER];
        const targetValue = Array.isArray(targetHeader)
          ? targetHeader[0]
          : targetHeader;
        const normalized = normalizeArchiveBaseUrl(targetValue ?? '');

        if (!normalized.ok) {
          writeProxyError(
            res,
            400,
            'ARCHIVE_PROXY_BAD_TARGET',
            normalized.message,
          );
          return;
        }

        const incoming = new URL(req.url, 'http://localhost');
        const upstreamPath = stripApiPrefix(incoming.pathname);
        const proxyRequest = validateArchiveProxyRequest(
          req.method ?? 'GET',
          upstreamPath,
        );
        if (!proxyRequest.ok) {
          writeProxyError(res, 405, proxyRequest.code, proxyRequest.message);
          return;
        }

        const target = new URL(normalized.value);
        const targetBasePath = target.pathname.replace(/\/+$/, '');
        req.url = `${targetBasePath}${upstreamPath}${incoming.search}`;

        proxy.web(req, res, {
          target: `${target.protocol}//${target.host}`,
          changeOrigin: true,
          secure: false,
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [
    archiveApiProxy(),
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
            handler: 'NetworkOnly',
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
    sourcemap: 'hidden',
    modulePreload: {
      polyfill: false,
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          for (const [chunkName, modules] of Object.entries(vendorChunks)) {
            if (modules.some((mod) => id.includes(`/node_modules/${mod}/`))) {
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
