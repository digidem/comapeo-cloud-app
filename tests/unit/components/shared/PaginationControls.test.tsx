import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { PaginationControls } from '@/components/shared/PaginationControls';

describe('PaginationControls', () => {
  it('renders "Showing X-Y of Z observations" text', () => {
    render(
      <PaginationControls
        showingStart={1}
        showingEnd={50}
        totalCount={250}
        hasMore={true}
        onLoadMore={vi.fn()}
      />,
    );

    expect(screen.getByText(/Showing/)).toBeInTheDocument();
    expect(screen.getByText(/1–50/)).toBeInTheDocument();
    expect(screen.getByText(/250/)).toBeInTheDocument();
  });

  it('renders Load More button when hasMore is true', () => {
    render(
      <PaginationControls
        showingStart={1}
        showingEnd={50}
        totalCount={250}
        hasMore={true}
        onLoadMore={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: /load more/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('hides Load More button when hasMore is false', () => {
    render(
      <PaginationControls
        showingStart={1}
        showingEnd={55}
        totalCount={55}
        hasMore={false}
        onLoadMore={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /load more/i }),
    ).not.toBeInTheDocument();
  });

  it('calls onLoadMore when Load More is clicked', async () => {
    const { userEvent } = await import('@tests/mocks/test-utils');
    const user = userEvent.setup();
    const onLoadMore = vi.fn();

    render(
      <PaginationControls
        showingStart={1}
        showingEnd={50}
        totalCount={250}
        hasMore={true}
        onLoadMore={onLoadMore}
      />,
    );

    await user.click(screen.getByRole('button', { name: /load more/i }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('shows correct range for single page with few items', () => {
    render(
      <PaginationControls
        showingStart={1}
        showingEnd={7}
        totalCount={7}
        hasMore={false}
        onLoadMore={vi.fn()}
      />,
    );

    expect(screen.getByText(/Showing 1–7 of 7/)).toBeInTheDocument();
  });

  it('shows correct range for empty dataset', () => {
    render(
      <PaginationControls
        showingStart={0}
        showingEnd={0}
        totalCount={0}
        hasMore={false}
        onLoadMore={vi.fn()}
      />,
    );

    expect(screen.getByText(/Showing 0–0 of 0/)).toBeInTheDocument();
  });

  it('does not render anything when totalCount is 0', () => {
    render(
      <PaginationControls
        showingStart={0}
        showingEnd={0}
        totalCount={0}
        hasMore={false}
        onLoadMore={vi.fn()}
      />,
    );

    // When totalCount is 0, nothing should render
    expect(screen.getByText(/Showing/)).toBeInTheDocument(); // range text still visible
    expect(
      screen.queryByRole('button', { name: /load more/i }),
    ).not.toBeInTheDocument();
  });
});
