import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { server } from './mocks/node';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Mock browser APIs not available in jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Pointer capture APIs used by Radix UI primitives
if (typeof HTMLElement !== 'undefined') {
  HTMLElement.prototype.hasPointerCapture =
    HTMLElement.prototype.hasPointerCapture ?? (() => false);
  HTMLElement.prototype.setPointerCapture =
    HTMLElement.prototype.setPointerCapture ?? (() => {});
  HTMLElement.prototype.releasePointerCapture =
    HTMLElement.prototype.releasePointerCapture ?? (() => {});
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

// Use getOwnPropertyDescriptor to allow user-event to redefine clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: () => Promise.resolve(),
    readText: () => Promise.resolve(''),
  },
  configurable: true,
});
