import { render, screen, userEvent, waitFor } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AddArchiveServerDialog } from '@/screens/Home/AddArchiveServerDialog';

const mocks = vi.hoisted(() => ({
  onboardArchive: vi.fn(),
  cancelArchiveOnboarding: vi.fn().mockResolvedValue(undefined),
  refetchQueries: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/sync-coordinator', () => ({
  onboardArchive: mocks.onboardArchive,
  cancelArchiveOnboarding: mocks.cancelArchiveOnboarding,
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({ refetchQueries: mocks.refetchQueries }),
  };
});

describe('AddArchiveServerDialog dashboard hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onboardArchive.mockImplementation(async (options) => {
      options.onStateChange?.('validating');
      options.onStateChange?.('pending');
      options.onStateChange?.('syncing');
      return {
        success: true,
        status: 'ready',
        serverId: 'server-1',
        projects: [],
        warnings: [],
      };
    });
  });

  it('refetches mounted projects after direct onboarding succeeds', async () => {
    const user = userEvent.setup();

    render(
      <AddArchiveServerDialog
        isOpen={true}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );

    await user.click(screen.getByTestId('advanced-toggle'));
    await user.type(
      screen.getByLabelText('Server URL'),
      'https://archive.test',
    );
    const credentialInput = document.querySelector<HTMLInputElement>(
      'input[type="password"]',
    );
    expect(credentialInput).not.toBeNull();
    await user.type(credentialInput!, 'x');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(mocks.onboardArchive).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      expect(mocks.refetchQueries).toHaveBeenCalledWith({
        queryKey: ['projects'],
        type: 'active',
      });
    });
  });
});
