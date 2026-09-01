/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst, NetworkOnly } from 'workbox-strategies';

import {
  LEGACY_RUNTIME_CACHE_NAMES,
  PUBLIC_RUNTIME_CACHE_NAME,
  SERVICE_WORKER_SECURITY_PROBE,
  SERVICE_WORKER_SECURITY_REVISION,
  hasSensitiveInviteRequestUrl,
  requestCarriesCredentialHeader,
} from './lib/service-worker-security';

declare const self: ServiceWorkerGlobalScope & {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Workbox injectManifest requires this exact global property.
  __WB_MANIFEST: Array<{ revision: string | null; url: string }>;
};

self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(
  ({ url, sameOrigin }) =>
    sameOrigin && (url.pathname === '/api' || url.pathname.startsWith('/api/')),
  new NetworkOnly(),
);

registerRoute(
  ({ request, url, sameOrigin }) =>
    request.method === 'GET' &&
    !sameOrigin &&
    url.protocol === 'https:' &&
    !requestCarriesCredentialHeader(request) &&
    !hasSensitiveInviteRequestUrl(url),
  new NetworkFirst({
    cacheName: PUBLIC_RUNTIME_CACHE_NAME,
    networkTimeoutSeconds: 10,
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: 60 * 60 * 24,
      }),
    ],
  }),
);

const navigationHandler = createHandlerBoundToURL('/index.html');
registerRoute(
  new NavigationRoute(navigationHandler, {
    denylist: [/^\/api(?:\/|$)/],
  }),
);

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all(
      LEGACY_RUNTIME_CACHE_NAMES.map((cacheName) => caches.delete(cacheName)),
    ).then(() => undefined),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== SERVICE_WORKER_SECURITY_PROBE) return;
  event.ports[0]?.postMessage({
    type: SERVICE_WORKER_SECURITY_PROBE,
    revision: SERVICE_WORKER_SECURITY_REVISION,
  });
});
