import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { CategoryIcon } from '@/screens/CategoriesEditor/CategoryIcon';

vi.mock('@/components/shared/auth-img', () => ({
  AuthImg: ({ src, alt }: { src: string; alt: string }) => (
    <img data-testid="category-auth-img" src={src} alt={alt} />
  ),
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn(
    (selector: (s: { baseUrl: string | null }) => string | null) =>
      selector({ baseUrl: 'https://archive.example.com' }),
  ),
}));

describe('CategoryIcon', () => {
  it('renders AuthImg when iconRef and projectRemoteId are provided', () => {
    render(
      <CategoryIcon
        projectRemoteId="proj-123"
        iconRef={{ docId: 'icon-abc' }}
        label="Deforestation"
      />,
    );

    const img = screen.getByTestId('category-auth-img');
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('src')).toContain(
      '/projects/proj-123/icon/icon-abc',
    );
  });

  it('renders letter fallback when iconRef is undefined', () => {
    render(<CategoryIcon projectRemoteId="proj-123" label="Deforestation" />);

    // ObservationCategoryIcon uses category-icon-fallback-only when no iconUrl
    expect(
      screen.getByTestId('category-icon-fallback-only'),
    ).toBeInTheDocument();
    expect(screen.getByText('D')).toBeInTheDocument();
    expect(screen.queryByTestId('category-auth-img')).not.toBeInTheDocument();
  });

  it('renders letter fallback when projectRemoteId is null', () => {
    render(
      <CategoryIcon
        projectRemoteId={null}
        iconRef={{ docId: 'icon-abc' }}
        label="Mining"
      />,
    );

    expect(
      screen.getByTestId('category-icon-fallback-only'),
    ).toBeInTheDocument();
    expect(screen.getByText('M')).toBeInTheDocument();
    expect(screen.queryByTestId('category-auth-img')).not.toBeInTheDocument();
  });

  it('renders alt text using intl message for category icon', () => {
    render(
      <CategoryIcon
        projectRemoteId="proj-123"
        iconRef={{ docId: 'icon-abc' }}
        label="Water Testing"
      />,
    );

    const img = screen.getByTestId('category-auth-img');
    expect(img).toBeInTheDocument();
    expect(img.getAttribute('alt')).toBe('Water Testing icon');
  });
});
