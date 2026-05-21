import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useArchiveStatus } from '@/hooks/useArchiveStatus';
import { useProjects } from '@/hooks/useProjects';
import { ArchiveBrowser } from '@/screens/Home/ArchiveBrowser';
import { useAuthStore } from '@/stores/auth-store';

vi.mock('@/hooks/useArchiveStatus', () => ({
  useArchiveStatus: vi.fn(),
}));

vi.mock('@/hooks/useProjects', () => ({
  useProjects: vi.fn(),
}));

const mockUseArchiveStatus = vi.mocked(useArchiveStatus);
const mockUseProjects = vi.mocked(useProjects);

describe('ArchiveBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      servers: [
        {
          id: 'server-1',
          label: 'North Archive',
          baseUrl: 'https://archive.example.com',
          token: 'token',
          status: 'idle',
        },
      ],
    });
    mockUseProjects.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      status: 'success',
    } as unknown as ReturnType<typeof useProjects>);
    mockUseArchiveStatus.mockReturnValue({
      servers: [
        {
          id: 'server-1',
          label: 'North Archive',
          baseUrl: 'https://archive.example.com',
          isSyncing: false,
          lastSyncedAt: null,
          error: null,
          hasCredentials: true,
          isStale: true,
        },
      ],
      anyError: false,
      anySyncing: false,
    });
  });

  it('renders remote archive settings as a mobile-sized native button', async () => {
    const user = userEvent.setup();
    const onSelectServer = vi.fn();

    render(
      <ArchiveBrowser
        selectedProjectId={null}
        onSelect={vi.fn()}
        onCreateNew={vi.fn()}
        onAddServer={vi.fn()}
        onSelectServer={onSelectServer}
      />,
    );

    const settingsButton = screen.getByRole('button', {
      name: 'Manage North Archive',
    });

    expect(settingsButton.tagName).toBe('BUTTON');
    expect(settingsButton).toHaveAttribute('type', 'button');
    expect(settingsButton).toHaveClass('h-10', 'w-10', 'sm:h-8', 'sm:w-8');

    await user.click(settingsButton);

    expect(onSelectServer).toHaveBeenCalledOnce();
    expect(onSelectServer).toHaveBeenCalledWith('server-1');
  });

  it('does not bubble archive toggle clicks to parent navigation handlers', async () => {
    const user = userEvent.setup();
    const onParentClick = vi.fn();

    render(
      <div onClick={onParentClick}>
        <ArchiveBrowser
          selectedProjectId={null}
          onSelect={vi.fn()}
          onCreateNew={vi.fn()}
          onAddServer={vi.fn()}
          onSelectServer={vi.fn()}
        />
      </div>,
    );

    const archiveToggle = screen.getByText('North Archive').closest('button');
    if (archiveToggle === null) {
      throw new Error('Archive toggle button not found');
    }
    await user.click(archiveToggle);

    expect(onParentClick).not.toHaveBeenCalled();
  });

  it('bubbles archive settings clicks to parent navigation handlers', async () => {
    const user = userEvent.setup();
    const onParentClick = vi.fn();

    render(
      <div onClick={onParentClick}>
        <ArchiveBrowser
          selectedProjectId={null}
          onSelect={vi.fn()}
          onCreateNew={vi.fn()}
          onAddServer={vi.fn()}
          onSelectServer={vi.fn()}
        />
      </div>,
    );

    await user.click(
      screen.getByRole('button', { name: 'Manage North Archive' }),
    );

    expect(onParentClick).toHaveBeenCalledOnce();
  });
});
