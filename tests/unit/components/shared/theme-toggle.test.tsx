import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { ThemeToggle } from '@/components/shared/theme-toggle';

vi.mock('@/stores/theme-store', () => ({
  useThemeStore: vi.fn((selector) =>
    selector({
      mode: 'system',
      resolved: 'light',
      setMode: vi.fn(),
    }),
  ),
}));

describe('ThemeToggle', () => {
  it('renders all theme options', () => {
    render(<ThemeToggle />);
    expect(screen.getByText('Light')).toBeInTheDocument();
    expect(screen.getByText('Dark')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
  });

  it('marks current theme as pressed', () => {
    render(<ThemeToggle />);
    const systemButton = screen.getByText('System');
    expect(systemButton).toHaveAttribute('aria-pressed', 'true');
  });
});
