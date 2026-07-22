import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { Category } from '@/hooks/useCategories';
import { CategoryDetail } from '@/screens/CategoriesEditor/CategoryDetail';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const sampleCategory: Category = {
  docId: 'cat-1',
  label: 'Deforestation',
  fieldRefs: [
    { docId: 'field-1', label: 'Severity' },
    { docId: 'field-2', label: 'Area' },
    { docId: 'field-3' },
  ],
  color: '#22c55e',
};

describe('CategoryDetail', () => {
  it('shows placeholder when category is null', () => {
    render(<CategoryDetail category={null} fieldLabels={new Map()} />);
    expect(screen.getByText('Select a category')).toBeInTheDocument();
  });

  it('renders category name', () => {
    render(
      <CategoryDetail category={sampleCategory} fieldLabels={new Map()} />,
    );
    expect(
      screen.getByRole('heading', { name: 'Deforestation' }),
    ).toBeInTheDocument();
  });

  it('renders category icon with first letter', () => {
    render(
      <CategoryDetail category={sampleCategory} fieldLabels={new Map()} />,
    );
    const icon = screen.getByTestId('category-detail-icon');
    expect(icon).toHaveTextContent('D');
  });

  it('renders category color swatch with hex value', () => {
    render(
      <CategoryDetail category={sampleCategory} fieldLabels={new Map()} />,
    );
    expect(screen.getByText('#22c55e')).toBeInTheDocument();
    const swatch = screen.getByTestId('color-swatch');
    expect(swatch).toHaveStyle({ backgroundColor: '#22c55e' });
  });

  it('renders field count and field refs with resolved labels', () => {
    render(
      <CategoryDetail
        category={sampleCategory}
        fieldLabels={
          new Map([
            ['field-1', 'Severity'],
            ['field-2', 'Area (ha)'],
          ])
        }
      />,
    );
    expect(screen.getByText(/3 fields/)).toBeInTheDocument();
    expect(screen.getByText('Severity')).toBeInTheDocument();
    expect(screen.getByText('Area (ha)')).toBeInTheDocument();
  });

  it('shows docId for field refs without a label in fieldLabels map', () => {
    render(
      <CategoryDetail category={sampleCategory} fieldLabels={new Map()} />,
    );
    expect(screen.getByText('field-3')).toBeInTheDocument();
  });

  it('renders back navigation link to /categories', () => {
    render(
      <CategoryDetail category={sampleCategory} fieldLabels={new Map()} />,
    );
    const backLink = screen.getByRole('link', { name: /Categories/ });
    expect(backLink).toHaveAttribute('href', '/categories');
  });

  it('renders appliesTo badges from fieldRefs', () => {
    render(
      <CategoryDetail category={sampleCategory} fieldLabels={new Map()} />,
    );
    expect(screen.getByText(/fields/)).toBeInTheDocument();
  });

  it('renders color swatch with background color matching category color', () => {
    render(
      <CategoryDetail category={sampleCategory} fieldLabels={new Map()} />,
    );
    const swatch = screen.getByTestId('color-swatch');
    expect(swatch).toHaveStyle({ backgroundColor: '#22c55e' });
  });

  it('renders empty fieldRefs gracefully', () => {
    const emptyFieldsCategory: Category = {
      docId: 'cat-2',
      label: 'Mining',
      fieldRefs: [],
      color: '#f59e0b',
    };
    render(
      <CategoryDetail category={emptyFieldsCategory} fieldLabels={new Map()} />,
    );
    expect(screen.getByText(/0 fields/)).toBeInTheDocument();
  });
});
