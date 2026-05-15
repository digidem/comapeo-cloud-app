import { render, screen } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthImg } from '@/components/shared/auth-img';

/**
 * Component integration tests mock useAuthenticatedImageUrl at the module level
 * to return instant success, preserving synchronous rendering behavior.
 */
const mockUseAuthenticatedImageUrl = vi.hoisted(() => {
  type AuthenticatedImageState = {
    blobUrl: string | null;
    isLoading: boolean;
    error: Error | null;
  };

  return vi.fn(
    (): AuthenticatedImageState => ({
      blobUrl: 'blob:mocked-url',
      isLoading: false,
      error: null,
    }),
  );
});

vi.mock('@/hooks/useAuthenticatedImageUrl', () => ({
  useAuthenticatedImageUrl: mockUseAuthenticatedImageUrl,
}));

describe('AuthImg', () => {
  beforeEach(() => {
    mockUseAuthenticatedImageUrl.mockReturnValue({
      blobUrl: 'blob:mocked-url',
      isLoading: false,
      error: null,
    });
  });

  it('renders skeleton during loading', () => {
    mockUseAuthenticatedImageUrl.mockReturnValue({
      blobUrl: null,
      isLoading: true,
      error: null,
    });

    render(<AuthImg src="http://example.com/photo.jpg" alt="Test" />);

    expect(screen.getByTestId('auth-img-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders image on success', () => {
    render(<AuthImg src="http://example.com/photo.jpg" alt="Test" />);

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'blob:mocked-url');
    expect(screen.queryByTestId('auth-img-skeleton')).not.toBeInTheDocument();
  });

  it('renders error fallback on error', () => {
    mockUseAuthenticatedImageUrl.mockReturnValue({
      blobUrl: null,
      isLoading: false,
      error: new Error('fail'),
    });

    render(<AuthImg src="http://example.com/photo.jpg" alt="Test" />);

    expect(screen.getByTestId('auth-img-error')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByTestId('auth-img-skeleton')).not.toBeInTheDocument();
  });

  it('forwards className to rendered element', () => {
    // Test success state
    const { rerender } = render(
      <AuthImg
        src="http://example.com/photo.jpg"
        alt="Test"
        className="custom-class"
      />,
    );
    expect(screen.getByRole('img')).toHaveClass('custom-class');

    // Test loading state
    mockUseAuthenticatedImageUrl.mockReturnValue({
      blobUrl: null,
      isLoading: true,
      error: null,
    });
    rerender(
      <AuthImg
        src="http://example.com/photo.jpg"
        alt="Test"
        className="custom-class"
      />,
    );
    expect(screen.getByTestId('auth-img-skeleton')).toHaveClass('custom-class');

    // Test error state
    mockUseAuthenticatedImageUrl.mockReturnValue({
      blobUrl: null,
      isLoading: false,
      error: new Error('fail'),
    });
    rerender(
      <AuthImg
        src="http://example.com/photo.jpg"
        alt="Test"
        className="custom-class"
      />,
    );
    expect(screen.getByTestId('auth-img-error')).toHaveClass('custom-class');
  });

  it('forwards alt text to image', () => {
    render(
      <AuthImg src="http://example.com/photo.jpg" alt="Photo description" />,
    );

    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Photo description');
  });

  it('renders with empty alt text', () => {
    render(<AuthImg src="http://example.com/photo.jpg" alt="" />);

    // <img alt=""> has role="presentation", not "img"
    const img = screen.getByRole('presentation');
    expect(img).toHaveAttribute('alt', '');
  });
});
