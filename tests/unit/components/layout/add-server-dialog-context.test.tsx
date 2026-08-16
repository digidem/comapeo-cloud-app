import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import {
  AddServerDialogProvider,
  useAddServerDialog,
} from '@/components/layout/add-server-dialog-context';

vi.mock('@/screens/Home/AddArchiveServerDialog', () => ({
  AddArchiveServerDialog: ({
    isOpen,
    onClose,
    onAdded,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onAdded: (serverId: string) => void;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label="Shared add server dialog">
        <button type="button" onClick={onClose}>
          Close shared dialog
        </button>
        <button type="button" onClick={() => onAdded('server-1')}>
          Complete shared dialog
        </button>
      </div>
    ) : null,
}));

function OpenDialogButton() {
  const { openAddServerDialog } = useAddServerDialog();
  return (
    <button type="button" onClick={openAddServerDialog}>
      Open shared dialog
    </button>
  );
}

function ProgrammaticCloseButton() {
  const { closeAddServerDialog } = useAddServerDialog();
  return (
    <button type="button" onClick={closeAddServerDialog}>
      Close shared dialog programmatically
    </button>
  );
}

describe('AddServerDialogProvider', () => {
  it('opens and closes the shared dialog', async () => {
    const user = userEvent.setup();
    render(
      <AddServerDialogProvider>
        <OpenDialogButton />
      </AddServerDialogProvider>,
    );

    await user.click(
      screen.getByRole('button', { name: 'Open shared dialog' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Shared add server dialog' }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Close shared dialog' }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the shared dialog when onboarding completes', async () => {
    const user = userEvent.setup();
    render(
      <AddServerDialogProvider>
        <OpenDialogButton />
      </AddServerDialogProvider>,
    );

    await user.click(
      screen.getByRole('button', { name: 'Open shared dialog' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Complete shared dialog' }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('supports programmatic close from a provider consumer', async () => {
    const user = userEvent.setup();
    render(
      <AddServerDialogProvider>
        <OpenDialogButton />
        <ProgrammaticCloseButton />
      </AddServerDialogProvider>,
    );

    await user.click(
      screen.getByRole('button', { name: 'Open shared dialog' }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'Close shared dialog programmatically',
      }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('fails loudly when used outside the provider', () => {
    expect(() => render(<OpenDialogButton />)).toThrow(
      'useAddServerDialog must be used within AddServerDialogProvider',
    );
  });
});
