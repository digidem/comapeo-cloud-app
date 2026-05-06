import { render, screen } from '@tests/mocks/test-utils';
import { userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { Switch } from '@/components/ui/switch';

describe('Switch', () => {
  it('renders switch', () => {
    render(<Switch />);
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('toggles on click', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();
    render(<Switch checked={false} onCheckedChange={handleChange} />);
    await user.click(screen.getByRole('switch'));
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('disabled state', () => {
    render(<Switch disabled />);
    expect(screen.getByRole('switch')).toHaveAttribute('disabled');
  });

  it('label is associated with switch', () => {
    render(<Switch label="Dark mode" id="dark-mode" />);
    const label = screen.getByText('Dark mode');
    const switchEl = screen.getByRole('switch');
    expect(label).toHaveAttribute('for', 'dark-mode');
    expect(switchEl).toHaveAttribute('id', 'dark-mode');
  });
});
