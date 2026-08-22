import { act, renderHook } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { useArchiveTransportApproval } from '@/components/shared/InsecureArchiveTransportDialog';

describe('useArchiveTransportApproval', () => {
  it('returns approval bound to the exact URL displayed', async () => {
    const { result } = renderHook(() =>
      useArchiveTransportApproval('http://archive.example.com'),
    );

    let decisionPromise!: ReturnType<typeof result.current.confirmInsecure>;
    act(() => {
      decisionPromise = result.current.confirmInsecure(
        'http://archive.example.com',
      );
    });
    expect(result.current.pendingUrl).toBe('http://archive.example.com');

    act(() => result.current.confirm());
    await expect(decisionPromise).resolves.toEqual({
      kind: 'approved',
      normalizedUrl: 'http://archive.example.com',
    });
  });

  it('cancels a pending approval when the current URL changes', async () => {
    const { result, rerender } = renderHook(
      ({ url }) => useArchiveTransportApproval(url),
      { initialProps: { url: 'http://archive.example.com' } },
    );

    let decisionPromise!: ReturnType<typeof result.current.confirmInsecure>;
    act(() => {
      decisionPromise = result.current.confirmInsecure(
        'http://archive.example.com',
      );
    });
    rerender({ url: 'http://different.example.com' });

    await expect(decisionPromise).resolves.toEqual({ kind: 'cancelled' });
    expect(result.current.pendingUrl).toBeNull();
  });

  it('does not resurrect an invalidated approval if the URL later changes back', async () => {
    const { result, rerender } = renderHook(
      ({ url }) => useArchiveTransportApproval(url),
      { initialProps: { url: 'http://archive.example.com' } },
    );

    let decisionPromise!: ReturnType<typeof result.current.confirmInsecure>;
    act(() => {
      decisionPromise = result.current.confirmInsecure(
        'http://archive.example.com',
      );
    });

    rerender({ url: 'http://different.example.com' });
    await expect(decisionPromise).resolves.toEqual({ kind: 'cancelled' });
    rerender({ url: 'http://archive.example.com' });

    expect(result.current.pendingUrl).toBeNull();
    act(() => result.current.confirm());
    expect(result.current.pendingUrl).toBeNull();
  });

  it('treats equivalent normalization as the same URL while confirmation is open', async () => {
    const { result, rerender } = renderHook(
      ({ url }) => useArchiveTransportApproval(url),
      { initialProps: { url: 'http://archive.example.com/' } },
    );

    let decisionPromise!: ReturnType<typeof result.current.confirmInsecure>;
    act(() => {
      decisionPromise = result.current.confirmInsecure(
        'http://archive.example.com',
      );
    });
    rerender({ url: 'HTTP://ARCHIVE.EXAMPLE.COM//' });
    expect(result.current.pendingUrl).toBe('http://archive.example.com');

    act(() => result.current.confirm());
    await expect(decisionPromise).resolves.toMatchObject({ kind: 'approved' });
  });

  it('cancels a pending decision on unmount', async () => {
    const { result, unmount } = renderHook(() =>
      useArchiveTransportApproval('http://archive.example.com'),
    );

    let decisionPromise!: ReturnType<typeof result.current.confirmInsecure>;
    act(() => {
      decisionPromise = result.current.confirmInsecure(
        'http://archive.example.com',
      );
    });
    unmount();

    await expect(decisionPromise).resolves.toEqual({ kind: 'cancelled' });
  });
});
