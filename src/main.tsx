import { registerSW } from 'virtual:pwa-register';

import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { installGlobalErrorHandlers } from './lib/global-error-handlers';
import { readSecurityStartupState } from './lib/security-startup-gate';
import { initSentry } from './lib/sentry';
import { LEGACY_RUNTIME_CACHE_NAMES } from './lib/service-worker-security';
import { registerStorageResetCoordinator } from './lib/storage-reset-coordinator';

const WORKER_RELOAD_GUARD = 'comapeo:securityWorkerReloadAttempted';

function prepareSecureWorkerTransition(): void {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener(
    'controllerchange',
    () => {
      let alreadyReloaded = false;
      try {
        alreadyReloaded = sessionStorage.getItem(WORKER_RELOAD_GUARD) === '1';
        if (!alreadyReloaded) {
          sessionStorage.setItem(WORKER_RELOAD_GUARD, '1');
        }
      } catch {
        // Storage can be unavailable. A one-shot event listener still prevents
        // repeated reloads in this page instance.
      }

      if (alreadyReloaded) return;

      const cleanup =
        typeof caches === 'undefined'
          ? Promise.resolve()
          : Promise.all(
              LEGACY_RUNTIME_CACHE_NAMES.map((cacheName) =>
                caches.delete(cacheName),
              ),
            ).then(() => undefined);

      void cleanup.finally(() => {
        window.location.reload();
      });
    },
    { once: true },
  );
}

const startupState = readSecurityStartupState();

if (startupState === 'ready') {
  try {
    sessionStorage.removeItem(WORKER_RELOAD_GUARD);
  } catch {
    // Non-secret loop guard cleanup is best effort only.
  }
  initSentry();
  registerSW({ immediate: true });
} else if (startupState === 'worker-transition-required') {
  prepareSecureWorkerTransition();
  // The transition page may register only the fixed worker. Credential entry,
  // invite redemption and remote archive traffic remain blocked by the shared
  // startup gate until the subsequent preflight verifies the new controller.
  registerSW({ immediate: true });
}

installGlobalErrorHandlers();
const { resetInProgress } = await registerStorageResetCoordinator();

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

if (resetInProgress) {
  // A tab opened during an active clear-all operation must not mount the app and
  // reopen its database connections. The coordinator reloads it on complete/abort.
  rootElement.setAttribute('aria-busy', 'true');
} else {
  createRoot(rootElement).render(
    createElement(StrictMode, null, createElement(App)),
  );
}
