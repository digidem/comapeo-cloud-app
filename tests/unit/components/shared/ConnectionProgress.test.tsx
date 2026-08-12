import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import {
  ConnectionProgress,
  type ConnectionStep,
} from '@/components/shared/ConnectionProgress';

const DEFAULT_STEPS: ConnectionStep[] = [
  { id: 'verify', label: 'Verifying invite...', status: 'pending' },
  { id: 'connect', label: 'Connecting to server...', status: 'pending' },
  { id: 'sync', label: 'Syncing data...', status: 'pending' },
  { id: 'prepare', label: 'Preparing dashboard...', status: 'pending' },
];

describe('ConnectionProgress', () => {
  it('renders all step labels', () => {
    render(<ConnectionProgress steps={DEFAULT_STEPS} />);
    for (const step of DEFAULT_STEPS) {
      expect(screen.getByText(step.label)).toBeInTheDocument();
    }
  });

  it('renders heading text', () => {
    render(
      <ConnectionProgress
        steps={DEFAULT_STEPS}
        heading="Connecting to archive..."
      />,
    );
    expect(screen.getByText('Connecting to archive...')).toBeInTheDocument();
  });

  it('shows spinner for the active step', () => {
    const steps: ConnectionStep[] = [
      { id: 'verify', label: 'Step 1', status: 'completed' },
      { id: 'connect', label: 'Step 2', status: 'active' },
      { id: 'sync', label: 'Step 3', status: 'pending' },
    ];
    render(<ConnectionProgress steps={steps} />);
    // Active step has a spinner (role="img" from Spinner)
    const rows = screen.getAllByRole('listitem');
    // Find the active row
    const activeRow = rows[1]!; // second step
    expect(activeRow.querySelector('[role="img"]')).toBeTruthy();
  });

  it('shows checkmark icon for completed steps', () => {
    const steps: ConnectionStep[] = [
      { id: 'verify', label: 'Step 1', status: 'completed' },
      { id: 'connect', label: 'Step 2', status: 'pending' },
    ];
    render(<ConnectionProgress steps={steps} />);
    const rows = screen.getAllByRole('listitem');
    const completedRow = rows[0]!;
    // Checkmark SVG has a path with stroke-dasharray animation
    expect(completedRow.querySelector('svg')).toBeTruthy();
    // Pending step should NOT have a checkmark icon
    const pendingRow = rows[1]!;
    expect(pendingRow.querySelector('svg')).toBeFalsy();
  });

  it('applies dimmed style to future (pending) steps', () => {
    const steps: ConnectionStep[] = [
      { id: 'verify', label: 'Step 1', status: 'active' },
      { id: 'connect', label: 'Step 2', status: 'pending' },
    ];
    render(<ConnectionProgress steps={steps} />);
    // Pending step text should have opacity-50 or similar dimmed class
    const pendingLabel = screen.getByText('Step 2');
    expect(pendingLabel).toHaveClass('opacity-50');
  });

  it('renders step numbers (1-based)', () => {
    render(<ConnectionProgress steps={DEFAULT_STEPS} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('shows error icon for errored steps', () => {
    const steps: ConnectionStep[] = [
      { id: 'verify', label: 'Step 1', status: 'error' },
    ];
    render(<ConnectionProgress steps={steps} />);
    const rows = screen.getAllByRole('listitem');
    // Error step should have a red X icon or error indicator
    const errorRow = rows[0]!;
    expect(errorRow).toHaveClass('text-error');
  });

  it('renders success state with Connected message', () => {
    const steps: ConnectionStep[] = DEFAULT_STEPS.map((s) => ({
      ...s,
      status: 'completed' as const,
    }));
    render(<ConnectionProgress steps={steps} isComplete />);
    expect(screen.getByText(/Connected!/i)).toBeInTheDocument();
  });
});
