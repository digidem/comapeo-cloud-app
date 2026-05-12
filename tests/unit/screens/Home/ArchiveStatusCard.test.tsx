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
        onRemove={noop}
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
        onRemove={noop}
      />,
    );
    const card = screen.getByTestId('archive-status-card');
    const dot = card.querySelector('span');
    expect(dot?.className).toContain('bg-success');
  });

  it('shows red dot when status is error', () => {
    render(
      <ArchiveStatusCard
        server={makeServer({ error: 'Connection refused' })}
        isSelected={false}
        onSelect={noop}
        onRemove={noop}
      />,
    );
    const card = screen.getByTestId('archive-status-card');
    const dot = card.querySelector('span');
    expect(dot?.className).toContain('bg-error');
  });

  it('shows blue dot when syncing', () => {
    render(
      <ArchiveStatusCard
        server={makeServer({ isSyncing: true })}
        isSelected={false}
        onSelect={noop}
        onRemove={noop}
      />,
    );
    const card = screen.getByTestId('archive-status-card');
    const dot = card.querySelector('span');
    expect(dot?.className).toContain('bg-info');
  });

  it('shows gray dot when idle', () => {
    render(
      <ArchiveStatusCard
        server={makeServer()}
        isSelected={false}
        onSelect={noop}
        onRemove={noop}
      />,
    );
    const card = screen.getByTestId('archive-status-card');
    const dot = card.querySelector('span');
    expect(dot?.className).toContain('bg-tag-neutral-text');
  });

  it('calls onSelect with server id when card is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <ArchiveStatusCard
        server={makeServer()}
        isSelected={false}
        onSelect={onSelect}
        onRemove={noop}
      />,
    );
    await user.click(screen.getByTestId('archive-status-card'));

    expect(onSelect).toHaveBeenCalledWith('srv-1');
  });

  it('applies selected styles when isSelected is true', () => {
    render(
      <ArchiveStatusCard
        server={makeServer()}
        isSelected={true}
        onSelect={noop}
        onRemove={noop}
      />,
    );
    const card = screen.getByTestId('archive-status-card');
    expect(card.className).toContain('bg-primary-soft');
  });

  it('does not apply selected styles when isSelected is false', () => {
    render(
      <ArchiveStatusCard
        server={makeServer()}
        isSelected={false}
        onSelect={noop}
        onRemove={noop}
      />,
    );
    const card = screen.getByTestId('archive-status-card');
    expect(card.className).not.toContain('bg-primary-soft');
  });

  it('renders edit and remove buttons', () => {
    render(
      <ArchiveStatusCard
        server={makeServer()}
        isSelected={false}
        onSelect={noop}
        onRemove={noop}
      />,
    );
    expect(screen.getByText('Edit')).toBeDefined();
    expect(screen.getByText('Remove')).toBeDefined();
  });

  it('opens confirmation dialog on remove click', async () => {
    const user = userEvent.setup();
    render(
      <ArchiveStatusCard
        server={makeServer()}
        isSelected={false}
        onSelect={noop}
        onRemove={noop}
      />,
    );

    await user.click(screen.getByText('Remove'));

    expect(
      screen.getByText(
        'Are you sure you want to remove "My Archive Server"? This action cannot be undone.',
      ),
    ).toBeDefined();
  });

  it('calls onRemove when remove is confirmed', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    render(
      <ArchiveStatusCard
        server={makeServer()}
        isSelected={false}
        onSelect={noop}
        onRemove={onRemove}
      />,
    );

    // Click remove to open confirmation dialog
    await user.click(screen.getByText('Remove'));

    // Click the confirm button in the dialog (the last "Remove" button)
    const removeButtons = screen.getAllByText('Remove');
    await user.click(removeButtons[removeButtons.length - 1]!);

    expect(onRemove).toHaveBeenCalledWith('srv-1');
  });
});
