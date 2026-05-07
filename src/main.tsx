import { registerSW } from 'virtual:pwa-register';

import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';

registerSW({ immediate: true });

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  createElement(StrictMode, null, createElement(App)),
);
