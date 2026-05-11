import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { ArchiveServerStatus } from '@/hooks/useArchiveStatus';
import { ArchiveStatusCard } from '@/screens/Home/ArchiveStatusCard';

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

const noop = vi.fn();

describe('ArchiveStatusCard', () => {
  it('renders server label', () => {
    render(
      <ArchiveStatusCard
        server={makeServer()}
        isSelected={false}
        onSelect={noop}
      />,
    );
    expect(screen.getByText('My Archive Server')).toBeDefined();
  });

  it('shows green dot when status is ok', () => {
    render(
      <ArchiveStatusCard
        server={makeServer({ lastSyncedAt: '2025-01-01' })}
        isSelected={false}
        onSelect={noop}
      />,
    );
    const dot = screen.getByRole('button').querySelector('span');
    expect(dot?.className).toContain('bg-success');
  });

  it('shows red dot when status is error', () => {
    render(
      <ArchiveStatusCard
        server={makeServer({ error: 'Connection refused' })}
        isSelected={false}
        onSelect={noop}
      />,
    );
    const dot = screen.getByRole('button').querySelector('span');
    expect(dot?.className).toContain('bg-error');
  });

  it('shows blue dot when syncing', () => {
    render(
      <ArchiveStatusCard
        server={makeServer({ isSyncing: true })}
        isSelected={false}
        onSelect={noop}
      />,
    );
    const dot = screen.getByRole('button').querySelector('span');
    expect(dot?.className).toContain('bg-info');
  });

  it('shows gray dot when idle', () => {
    render(
      <ArchiveStatusCard
        server={makeServer()}
        isSelected={false}
        onSelect={noop}
      />,
    );
    const dot = screen.getByRole('button').querySelector('span');
    expect(dot?.className).toContain('bg-tag-neutral-text');
  });

  it('calls onSelect with server id when clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <ArchiveStatusCard
        server={makeServer()}
        isSelected={false}
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByRole('button'));

    expect(onSelect).toHaveBeenCalledWith('srv-1');
  });

  it('applies selected styles when isSelected is true', () => {
    render(
      <ArchiveStatusCard
        server={makeServer()}
        isSelected={true}
        onSelect={noop}
      />,
    );
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-primary-soft');
  });

  it('does not apply selected styles when isSelected is false', () => {
    render(
      <ArchiveStatusCard
        server={makeServer()}
        isSelected={false}
        onSelect={noop}
      />,
    );
    const btn = screen.getByRole('button');
    expect(btn.className).not.toContain('bg-primary-soft');
  });
});
