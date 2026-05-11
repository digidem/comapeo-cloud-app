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
