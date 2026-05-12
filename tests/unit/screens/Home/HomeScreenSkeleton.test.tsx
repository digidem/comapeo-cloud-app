import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HomeScreenSkeleton } from '@/screens/Home/HomeScreenSkeleton';

describe('HomeScreenSkeleton', () => {
  it('renders many skeleton elements matching layout structure', () => {
    render(<HomeScreenSkeleton />);
    const skeletons = screen.getAllByTestId('skeleton');
    // 4 stat cards (header + value = 8) + banner (1+3) + activity (1+3*3) + map (1)
    expect(skeletons.length).toBeGreaterThanOrEqual(15);
  });

  it('renders pulse animation container', () => {
    render(<HomeScreenSkeleton />);
    const container = screen.getByTestId('home-skeleton');
    expect(container.className).toContain('motion-safe:animate-pulse');
  });
});
