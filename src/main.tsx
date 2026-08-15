import { registerSW } from 'virtual:pwa-register';

import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { installGlobalErrorHandlers } from './lib/global-error-handlers';
import { initSentry } from './lib/sentry';
import { registerStorageResetCoordinator } from './lib/storage-reset-coordinator';

initSentry();
installGlobalErrorHandlers();
const { resetInProgress } = await registerStorageResetCoordinator();
registerSW({ immediate: true });

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
