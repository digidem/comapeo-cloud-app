import { render, screen } from '@tests/mocks/test-utils';
import { userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { ThemeToggle } from '@/components/shared/theme-toggle';
import { useThemeStore } from '@/stores/theme-store';

describe('ThemeToggle', () => {
  it('renders all three theme options', () => {
    render(<ThemeToggle />);
    expect(screen.getByText('Cloud')).toBeInTheDocument();
    expect(screen.getByText('Mobile')).toBeInTheDocument();
    expect(screen.getByText('Sentinel')).toBeInTheDocument();
  });

  it('calls setTheme on click', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByText('Mobile'));
    expect(useThemeStore.getState().theme).toBe('mobile');
  });

  it('highlights active theme', () => {
    useThemeStore.setState({ theme: 'sentinel' });
    render(<ThemeToggle />);
    const sentinelBtn = screen.getByText('Sentinel');
    expect(sentinelBtn.className).toContain('bg-white');
    expect(sentinelBtn.className).toContain('text-primary-navy');
  });
});
