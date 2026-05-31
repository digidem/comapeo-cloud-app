import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { ObservationCategoryIcon } from '@/components/shared/ObservationCategoryIcon';

vi.mock('@/components/shared/auth-img', () => ({
  AuthImg: ({ src, alt }: { src: string; alt: string }) => (
    <img data-testid="category-auth-img" src={src} alt={alt} />
  ),
}));

describe('ObservationCategoryIcon', () => {
  it('renders an authenticated icon image when category metadata has iconUrl', () => {
    render(
      <ObservationCategoryIcon
        category={{
          id: 'forest',
          name: 'Forest',
          iconDocId: 'icon-forest',
          iconUrl: '/projects/project-1/icon/icon-forest',
        }}
      />,
    );

    expect(screen.getByTestId('category-auth-img')).toHaveAttribute(
      'src',
      '/projects/project-1/icon/icon-forest',
    );
    expect(screen.getByAltText('Forest icon')).toBeInTheDocument();
  });

  it('renders a color fallback when there is no icon URL', () => {
    render(
      <ObservationCategoryIcon
        category={{ id: 'forest', name: 'Forest', color: '#117733' }}
      />,
    );

    expect(screen.getByRole('img', { name: 'Forest' })).toHaveStyle({
      backgroundColor: '#117733',
    });
    expect(screen.getByText('F')).toBeInTheDocument();
  });

  it('renders a visible letter fallback behind icon images', () => {
    render(
      <ObservationCategoryIcon
        category={{
          id: 'forest',
          name: 'Forest',
          iconUrl: '/projects/project-1/icon/icon-forest',
        }}
      />,
    );

    expect(screen.getByText('F')).toBeInTheDocument();
  });
});
