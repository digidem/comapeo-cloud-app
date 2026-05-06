import { act, fireEvent } from '@testing-library/react';
import { render, screen } from '@tests/mocks/test-utils';
import { userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { CopyButton } from '@/components/shared/copy-button';

describe('CopyButton', () => {
  it('renders with default label text', () => {
    render(<CopyButton text="hello" />);
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('renders with custom label text', () => {
    render(<CopyButton text="hello" label="Copy code" />);
    expect(
      screen.getByRole('button', { name: 'Copy code' }),
    ).toBeInTheDocument();
  });

  it('calls clipboard.writeText with correct text on click', () => {
    const writeTextSpy = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    render(<CopyButton text="hello world" />);
    fireEvent.click(screen.getByRole('button'));
    expect(writeTextSpy).toHaveBeenCalledWith('hello world');
  });

  it('shows successLabel after click', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<CopyButton text="hello" successLabel="Done!" />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button', { name: 'Done!' })).toBeInTheDocument();
  });

  it('shows default successLabel "Copied!" after click', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<CopyButton text="hello" />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
  });

  it('reverts to label after timeout', () => {
    vi.useFakeTimers();
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    render(<CopyButton text="hello" label="Copy" successLabel="Copied!" />);
    const button = screen.getByRole('button', { name: 'Copy' });

    act(() => {
      button.click();
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();

    vi.useRealTimers();
  });
});
