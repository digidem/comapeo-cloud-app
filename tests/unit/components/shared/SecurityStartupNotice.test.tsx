import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SecurityStartupNotice } from '@/components/shared/SecurityStartupNotice';

function setStartupState(
  state: 'ready' | 'storage-cleanup-required' | 'worker-transition-required',
) {
  document.documentElement.dataset.comapeoSecurityStartup = state;
}

describe('SecurityStartupNotice', () => {
  afterEach(() => {
    delete document.documentElement.dataset.comapeoSecurityStartup;
  });

  it('renders nothing when secure startup is ready', () => {
    setStartupState('ready');
    render(<SecurityStartupNotice />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('explains cleanup recovery and tells invite users to reopen the original invitation', async () => {
    setStartupState('storage-cleanup-required');
    const retry = vi.fn();
    const user = userEvent.setup();
    render(<SecurityStartupNotice onRetry={retry} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      /browser security cleanup must finish/i,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      /original message, app, or source containing the invitation link/i,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      /request a fresh invitation/i,
    );
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('shows a distinct security-worker update state and the same invite recovery rule', () => {
    setStartupState('worker-transition-required');
    render(<SecurityStartupNotice onRetry={() => {}} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      /security update required/i,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/connect and retry/i);
    expect(screen.getByRole('status')).toHaveTextContent(
      /original message, app, or source containing the invitation link/i,
    );
  });

  it('fails closed to cleanup guidance when the marker is malformed', () => {
    document.documentElement.dataset.comapeoSecurityStartup =
      'unexpected-state';
    render(<SecurityStartupNotice onRetry={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      /browser security cleanup must finish/i,
    );
  });
});
