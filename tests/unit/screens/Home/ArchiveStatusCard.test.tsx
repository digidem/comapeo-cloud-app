import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import React from 'react';

import type { ArchiveServerStatus } from '@/hooks/useArchiveStatus';
import { ArchiveStatusCard } from '@/screens/Home/ArchiveStatusCard';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({
      to,
      children,
      className,
    }: {
      to: string;
      children: React.ReactNode;
      className?: string;
    }) => (
      <a href={to} className={className}>
        {children}
      </a>
    ),
  };
});

function makeServer(
  overrides: Partial<ArchiveServerStatus> = {},
): ArchiveServerStatus {
  return {
    id: 'srv-1',
    label: 'My Archive Server',
    baseUrl: 'https://archive.example.com',
    isSyncing: false,
    lastSyncedAt: null,
    error: null,
    hasCredentials: true,
    ...overrides,
  };
}

describe('ArchiveStatusCard', () => {
  it('renders server label', () => {
    render(<ArchiveStatusCard server={makeServer()} onSync={vi.fn()} />);
    expect(screen.getByText('My Archive Server')).toBeDefined();
  });

  it('shows sync button when idle', () => {
    render(<ArchiveStatusCard server={makeServer()} onSync={vi.fn()} />);
    expect(screen.getByRole('button', { name: /sync/i })).toBeDefined();
  });

  it('calls onSync with server id when sync button clicked', async () => {
    const user = userEvent.setup();
    const onSync = vi.fn();

    render(<ArchiveStatusCard server={makeServer()} onSync={onSync} />);
    await user.click(screen.getByRole('button', { name: /sync/i }));

    expect(onSync).toHaveBeenCalledWith('srv-1');
  });

  it('shows syncing state when isSyncing', () => {
    render(
      <ArchiveStatusCard
        server={makeServer({ isSyncing: true })}
        onSync={vi.fn()}
      />,
    );
    const syncingElements = screen.getAllByText(/syncing/i);
    expect(syncingElements.length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /sync now/i })).toBeNull();
  });

  it('shows error badge and message when error', () => {
    render(
      <ArchiveStatusCard
        server={makeServer({ error: 'Connection refused' })}
        onSync={vi.fn()}
      />,
    );
    expect(screen.getByText('Connection refused')).toBeDefined();
    const badge = screen.getByText(/error/i);
    expect(badge).toBeDefined();
  });

  it('shows credentials unavailable state with settings link', () => {
    render(
      <ArchiveStatusCard
        server={makeServer({ hasCredentials: false })}
        onSync={vi.fn()}
      />,
    );
    expect(screen.getByText(/credentials unavailable/i)).toBeDefined();
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toContain('/settings');
  });
});
