/**
 * Tests for global error handlers module.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('installGlobalErrorHandlers', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.resetModules();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('installs error and unhandledrejection handlers', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    const { installGlobalErrorHandlers } =
      await import('@/lib/global-error-handlers');
    installGlobalErrorHandlers();

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'error',
      expect.any(Function),
    );
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'unhandledrejection',
      expect.any(Function),
    );

    addEventListenerSpy.mockRestore();
  });

  it('logs errors to console', async () => {
    const { installGlobalErrorHandlers } =
      await import('@/lib/global-error-handlers');
    installGlobalErrorHandlers();

    // Simulate an error event
    const errorEvent = new ErrorEvent('error', {
      error: new Error('test error'),
      message: 'test error',
    });
    window.dispatchEvent(errorEvent);

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('logs unhandled rejections to console', async () => {
    const { installGlobalErrorHandlers } =
      await import('@/lib/global-error-handlers');
    installGlobalErrorHandlers();

    // Simulate an unhandled rejection event with a resolved promise
    // (we only need to test the handler fires, not that it rejects)
    const rejectionEvent = new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.resolve(),
      reason: new Error('test rejection'),
    });
    window.dispatchEvent(rejectionEvent);

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('is idempotent — calling twice does not add duplicate handlers', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    const { installGlobalErrorHandlers } =
      await import('@/lib/global-error-handlers');
    installGlobalErrorHandlers();
    installGlobalErrorHandlers();

    // Should only add 2 handlers (error + unhandledrejection), not 4
    const errorCalls = addEventListenerSpy.mock.calls.filter(
      (c) => c[0] === 'error',
    ).length;
    const rejectionCalls = addEventListenerSpy.mock.calls.filter(
      (c) => c[0] === 'unhandledrejection',
    ).length;

    expect(errorCalls).toBe(1);
    expect(rejectionCalls).toBe(1);

    addEventListenerSpy.mockRestore();
  });
});
