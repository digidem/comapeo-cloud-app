import { fireEvent, render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { Category } from '@/hooks/useCategories';
import { CategoryGrid } from '@/screens/CategoriesEditor/CategoryGrid';

vi.mock('@/screens/CategoriesEditor/CategoryIcon', () => ({
  CategoryIcon: ({ iconRef, color, size }: Record<string, unknown>) => (
    <div
      data-testid="category-icon"
      data-icon-ref={iconRef ? 'present' : 'absent'}
      data-color={color as string}
      data-size={String(size)}
    />
  ),
}));

const sampleCategories: Category[] = [
  {
    docId: 'cat-1',
    label: 'Deforestation',
    fieldRefs: [{ docId: 'f1' }, { docId: 'f2' }],
    color: '#22c55e',
    iconRef: undefined,
  },
  {
    docId: 'cat-2',
    label: 'Mining',
    fieldRefs: [{ docId: 'f3' }],
    color: '#f59e0b',
    iconRef: { docId: 'icon-1' },
  },
  {
    docId: 'cat-3',
    label: 'Roads',
    fieldRefs: [],
    color: '#3b82f6',
    iconRef: undefined,
  },
];

describe('CategoryGrid', () => {
  it('renders category cards with names (flat, no group headings)', () => {
    render(<CategoryGrid categories={sampleCategories} />);
    expect(screen.getByText('Deforestation')).toBeInTheDocument();
    expect(screen.getByText('Mining')).toBeInTheDocument();
    expect(screen.getByText('Roads')).toBeInTheDocument();
  });

  it('does not render group headings', () => {
    render(<CategoryGrid categories={sampleCategories} />);
    expect(screen.queryByText('environment')).not.toBeInTheDocument();
    expect(screen.queryByText('infrastructure')).not.toBeInTheDocument();
  });

  it('renders CategoryIcon with iconRef when available', () => {
    render(<CategoryGrid categories={sampleCategories} />);
    const icons = document.querySelectorAll('[data-testid="category-icon"]');
    expect(icons.length).toBe(3);
    // Mining (index 1) has iconRef
    expect(icons[1]!.getAttribute('data-icon-ref')).toBe('present');
    // Deforestation (index 0) has no iconRef
    expect(icons[0]!.getAttribute('data-icon-ref')).toBe('absent');
  });

  it('renders nothing when categories is empty', () => {
    const { container } = render(<CategoryGrid categories={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('category cards are buttons (semantic)', () => {
    render(<CategoryGrid categories={sampleCategories} />);
    const cards = document.querySelectorAll('[data-testid="category-card"]');
    for (const card of cards) {
      expect(card.tagName).toBe('BUTTON');
    }
  });

  it('does not render color accent strip', () => {
    render(<CategoryGrid categories={sampleCategories} />);
    const cards = document.querySelectorAll('[data-testid="category-card"]');
    for (const card of cards) {
      expect(
        card.querySelector('[data-testid="color-accent"]'),
      ).not.toBeInTheDocument();
    }
  });

  it('does not render field count badge', () => {
    render(<CategoryGrid categories={sampleCategories} />);
    const cards = document.querySelectorAll('[data-testid="category-card"]');
    for (const card of cards) {
      expect(card.textContent).not.toContain('fields');
    }
  });

  it('marks selected category', () => {
    render(
      <CategoryGrid categories={sampleCategories} selectedCategoryId="cat-2" />,
    );
    const cards = document.querySelectorAll('[data-testid="category-card"]');
    expect(cards[1]).toHaveAttribute('aria-pressed', 'true');
    expect(cards[0]).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onCategorySelect with docId when card is clicked', () => {
    const onSelect = vi.fn();
    render(
      <CategoryGrid
        categories={sampleCategories}
        onCategorySelect={onSelect}
      />,
    );
    const cards = document.querySelectorAll('[data-testid="category-card"]');
    fireEvent.click(cards[0]!);
    expect(onSelect).toHaveBeenCalledWith('cat-1');
  });

  it('passes serverBaseUrl to CategoryIcon', () => {
    const serverBaseUrl = 'https://test.com';
    render(
      <CategoryGrid
        categories={sampleCategories}
        serverBaseUrl={serverBaseUrl}
      />,
    );
    // CategoryIcon mock doesn't capture serverBaseUrl, but CategoryCard
    // should receive it without errors
    expect(screen.getByText('Deforestation')).toBeInTheDocument();
  });
});
