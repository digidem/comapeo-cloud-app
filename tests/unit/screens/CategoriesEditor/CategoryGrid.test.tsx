import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import type { CategoryGroup } from '@/hooks/useCategories';
import { CategoryGrid } from '@/screens/CategoriesEditor/CategoryGrid';

const sampleGroups: CategoryGroup[] = [
  {
    type: 'environment',
    categories: [
      {
        docId: 'cat-1',
        label: 'Deforestation',
        fieldRefs: [
          { docId: 'f1', label: 'Severity' },
          { docId: 'f2', label: 'Area' },
        ],
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
    ],
  },
  {
    type: 'infrastructure',
    categories: [
      {
        docId: 'cat-3',
        label: 'Roads',
        fieldRefs: [],
        color: '#3b82f6',
        iconRef: undefined,
      },
    ],
  },
];

describe('CategoryGrid', () => {
  it('renders group headings for each tags.type', () => {
    render(<CategoryGrid groups={sampleGroups} />);
    expect(screen.getByText('environment')).toBeInTheDocument();
    expect(screen.getByText('infrastructure')).toBeInTheDocument();
  });

  it('renders category cards with names', () => {
    render(<CategoryGrid groups={sampleGroups} />);
    expect(screen.getByText('Deforestation')).toBeInTheDocument();
    expect(screen.getByText('Mining')).toBeInTheDocument();
    expect(screen.getByText('Roads')).toBeInTheDocument();
  });

  it('renders color accent on category cards', () => {
    render(<CategoryGrid groups={sampleGroups} />);
    const cards = document.querySelectorAll('[data-testid="category-card"]');
    expect(cards.length).toBe(3);

    const deforestationCard = cards[0] as HTMLElement;
    const accent = deforestationCard.querySelector(
      '[data-testid="color-accent"]',
    );
    expect(accent).toBeInTheDocument();
    expect(accent).toHaveStyle({ backgroundColor: '#22c55e' });
  });

  it('renders first letter of name as icon fallback', () => {
    render(<CategoryGrid groups={sampleGroups} />);
    const cards = document.querySelectorAll('[data-testid="category-card"]');
    const deforestationCard = cards[0] as HTMLElement;
    const icon = deforestationCard.querySelector(
      '[data-testid="category-icon"]',
    );
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveTextContent('D');
  });

  it('renders field count badge', () => {
    render(<CategoryGrid groups={sampleGroups} />);
    const cards = document.querySelectorAll('[data-testid="category-card"]');
    // Deforestation has 2 fields
    expect(cards[0]).toHaveTextContent('2 fields');
    // Mining has 1 field
    expect(cards[1]).toHaveTextContent('1 field');
    // Roads has 0 fields
    expect(cards[2]).toHaveTextContent('0 fields');
  });

  it('renders empty state when no groups', () => {
    render(<CategoryGrid groups={[]} />);
    expect(
      screen.getByText('No categories match your search'),
    ).toBeInTheDocument();
  });

  it('category cards are keyboard focusable', () => {
    render(<CategoryGrid groups={sampleGroups} />);
    const cards = document.querySelectorAll('[data-testid="category-card"]');
    for (const card of cards) {
      expect(card).toHaveAttribute('tabindex', '0');
    }
  });

  it('category cards use semantic article element', () => {
    render(<CategoryGrid groups={sampleGroups} />);
    const articles = document.querySelectorAll(
      'article[data-testid="category-card"]',
    );
    expect(articles.length).toBe(3);
  });
});
