import { registerSW } from 'virtual:pwa-register';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { installGlobalErrorHandlers } from './lib/global-error-handlers';
import { initSentry } from './lib/sentry';

initSentry();
installGlobalErrorHandlers();
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
