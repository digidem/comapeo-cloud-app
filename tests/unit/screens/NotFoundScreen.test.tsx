import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { NotFoundScreen } from '@/screens/NotFoundScreen';

// Mock TanStack Router Link
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    Link: ({
      children,
      to,
      ...props
    }: {
      children: React.ReactNode;
      to: string;
      [key: string]: unknown;
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  };
});

describe('NotFoundScreen', () => {
  it('renders 404 heading', () => {
    render(<NotFoundScreen />);

    expect(screen.getByText('404')).toBeInTheDocument();
  });

  it('renders page not found message', () => {
    render(<NotFoundScreen />);

    expect(screen.getByText('Page not found')).toBeInTheDocument();
  });

  it('renders go home link', () => {
    render(<NotFoundScreen />);

    expect(
      screen.getByRole('link', { name: 'Go to Home' }),
    ).toBeInTheDocument();
  });
});
