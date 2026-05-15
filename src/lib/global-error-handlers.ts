/**
 * Console logging for uncaught exceptions and unhandled promise rejections.
 *
 * Sentry installs its own `onerror`/`unhandledrejection` integrations during
 * `Sentry.init()`, so this module deliberately does NOT forward to Sentry —
 * doing so would double-count every event.
 */

let installed = false;

export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    console.error('[global-error]', event.error ?? event.message, event);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason =
      event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason));
    console.error('[global-error] Unhandled promise rejection:', reason);
  });
}
