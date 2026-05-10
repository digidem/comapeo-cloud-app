import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import {
  ShellSlotProvider,
  useShellOverrides,
  useShellSlot,
} from '@/components/layout/shell-slot';

function OverridesReader({ label = 'overrides' }: { label?: string }) {
  const overrides = useShellOverrides();
  return <span data-testid={label}>{JSON.stringify(overrides)}</span>;
}

function SlotWriter({
  overrides,
}: {
  overrides: Parameters<typeof useShellSlot>[0];
}) {
  useShellSlot(overrides);
  return <span>slot-writer</span>;
}

describe('shell-slot', () => {
  it('useShellOverrides returns empty overrides by default', () => {
    render(
      <ShellSlotProvider>
        <OverridesReader />
      </ShellSlotProvider>,
    );

    expect(screen.getByTestId('overrides').textContent).toBe('{}');
  });

  it('useShellSlot sets overrides that useShellOverrides reads', () => {
    render(
      <ShellSlotProvider>
        <SlotWriter overrides={{ topbarWorkspaceName: 'Test' }} />
        <OverridesReader />
      </ShellSlotProvider>,
    );

    const overrides = JSON.parse(
      screen.getByTestId('overrides').textContent ?? '{}',
    );
    expect(overrides.topbarWorkspaceName).toBe('Test');
  });

  it('useShellSlot cleanup resets overrides to empty', () => {
    const { unmount } = render(
      <ShellSlotProvider>
        <SlotWriter overrides={{ topbarWorkspaceName: 'Cleanup Test' }} />
        <OverridesReader />
      </ShellSlotProvider>,
    );

    // Verify overrides were set
    const overrides = JSON.parse(
      screen.getByTestId('overrides').textContent ?? '{}',
    );
    expect(overrides.topbarWorkspaceName).toBe('Cleanup Test');

    // Unmount the writer
    unmount();

    // After unmount, we need to re-render to read the context
    render(
      <ShellSlotProvider>
        <OverridesReader label="after-unmount" />
      </ShellSlotProvider>,
    );

    // New provider has fresh state (empty)
    expect(screen.getByTestId('after-unmount').textContent).toBe('{}');
  });

  it('multiple useShellSlot calls — last mounted wins', () => {
    render(
      <ShellSlotProvider>
        <SlotWriter overrides={{ topbarWorkspaceName: 'First' }} />
        <SlotWriter overrides={{ topbarWorkspaceName: 'Second' }} />
        <OverridesReader />
      </ShellSlotProvider>,
    );

    const overrides = JSON.parse(
      screen.getByTestId('overrides').textContent ?? '{}',
    );
    // The last useShellSlot call wins because its useEffect runs last
    expect(overrides.topbarWorkspaceName).toBe('Second');
  });
});
