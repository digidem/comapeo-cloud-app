import { render, screen } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MapScreenLayout } from '@/components/shared/MapScreenLayout/MapScreenLayout';
import { useIsDesktop } from '@/hooks/useIsDesktop';

// MapScreenLayout no longer renders a map itself; children supply it.
// Render a stand-in "map" element as children so slot/child assertions work.
const renderLayout = (props: Record<string, unknown> = {}) =>
  render(
    <MapScreenLayout {...(props as object)}>
      <div data-testid="map-child">map</div>
    </MapScreenLayout>,
  );

vi.mock('@/hooks/useIsDesktop', () => ({
  useIsDesktop: vi.fn(() => false),
}));

describe('MapScreenLayout', () => {
  beforeEach(() => {
    vi.mocked(useIsDesktop).mockReturnValue(false);
  });

  it('renders the map container', () => {
    renderLayout();
    expect(screen.getByTestId('map-child')).toBeInTheDocument();
  });

  it('renders topLeft slot content', () => {
    renderLayout({ topLeft: <span>top-left-content</span> });
    expect(screen.getByText('top-left-content')).toBeInTheDocument();
  });

  it('supports a custom topLeft position that reserves adjacent controls', () => {
    renderLayout({
      topLeft: <span>top-left-content</span>,
      topLeftPositionClassName: 'top-[4.25rem] left-3 right-20',
    });

    expect(screen.getByText('top-left-content').parentElement).toHaveClass(
      'top-[4.25rem]',
      'left-3',
      'right-20',
    );
  });

  it('renders topRight slot content', () => {
    renderLayout({ topRight: <span>top-right-content</span> });
    expect(screen.getByText('top-right-content')).toBeInTheDocument();
  });

  it('supports a custom topRight layer above blocking query overlays', () => {
    renderLayout({
      topRight: <span>top-right-content</span>,
      topRightPositionClassName: 'top-4 right-3 z-30 items-center',
    });

    expect(screen.getByText('top-right-content').parentElement).toHaveClass(
      'top-4',
      'right-3',
      'z-30',
    );
  });

  it('renders bottomLeft slot content', () => {
    renderLayout({ bottomLeft: <span>bottom-left-content</span> });
    expect(screen.getByText('bottom-left-content')).toBeInTheDocument();
  });

  it('renders bottomRight slot content', () => {
    renderLayout({ bottomRight: <span>bottom-right-content</span> });
    expect(screen.getByText('bottom-right-content')).toBeInTheDocument();
  });

  it('renders children inside map container', () => {
    renderLayout();
    expect(screen.getByTestId('map-child').parentElement).toHaveClass(
      'relative',
      'flex-1',
      'overflow-hidden',
    );
  });

  it('does not render sidebar on mobile', () => {
    vi.mocked(useIsDesktop).mockReturnValue(false);
    renderLayout({ sidebar: <div data-testid="sidebar-content">Sidebar</div> });
    expect(screen.queryByTestId('sidebar-content')).not.toBeInTheDocument();
  });

  it('renders sidebar on desktop', () => {
    vi.mocked(useIsDesktop).mockReturnValue(true);
    renderLayout({ sidebar: <div data-testid="sidebar-content">Sidebar</div> });
    expect(screen.getByTestId('sidebar-content')).toBeInTheDocument();
  });

  it('does not render topLeft when not provided', () => {
    renderLayout();
    expect(screen.queryByText('top-left-content')).not.toBeInTheDocument();
  });

  it('does not render sidebar when not provided even on desktop', () => {
    vi.mocked(useIsDesktop).mockReturnValue(true);
    renderLayout();
    // aside should not exist when sidebar is undefined
    expect(document.querySelector('aside')).toBeNull();
  });

  it('does not render sidebar when null is explicitly provided on desktop', () => {
    vi.mocked(useIsDesktop).mockReturnValue(true);
    renderLayout({ sidebar: null });
    // null sidebar should not render the aside
    expect(document.querySelector('aside')).toBeNull();
  });
});
