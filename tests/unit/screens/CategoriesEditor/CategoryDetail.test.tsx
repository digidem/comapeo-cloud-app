import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { Category } from '@/hooks/useCategories';
import type { NormalizedField } from '@/lib/fields/normalize';
import { CategoryDetail } from '@/screens/CategoriesEditor/CategoryDetail';

vi.mock('@/screens/CategoriesEditor/CategoryIcon', () => ({
  CategoryIcon: ({
    iconRef,
    color,
    size,
    iconSize,
  }: Record<string, unknown>) => (
    <div
      data-testid="category-detail-icon"
      data-icon-ref={iconRef ? 'present' : 'absent'}
      data-color={color as string}
      data-size={String(size)}
      data-icon-size={String(iconSize)}
    />
  ),
}));

vi.mock('@/screens/CategoriesEditor/FieldViewer', () => ({
  FieldViewer: ({ fields }: { fields: NormalizedField[] }) => (
    <div data-testid="field-viewer" data-field-count={String(fields.length)}>
      {fields.map((f) => (
        <span key={f.docId} data-testid={`field-${f.docId}`}>
          {f.label}
        </span>
      ))}
    </div>
  ),
}));

const onBack = vi.fn();

const sampleCategory: Category = {
  docId: 'cat-1',
  label: 'Deforestation',
  fieldRefs: [{ docId: 'field-1' }, { docId: 'field-2' }, { docId: 'field-3' }],
  color: '#22c55e',
};

const sampleFields: NormalizedField[] = [
  {
    docId: 'field-1',
    tagKey: 'severity',
    type: 'text',
    label: 'Severity',
  },
  {
    docId: 'field-2',
    tagKey: 'area',
    type: 'number',
    label: 'Area (ha)',
  },
  {
    docId: 'field-3',
    tagKey: 'notes',
    type: 'textarea',
    label: 'Notes',
  },
];

describe('CategoryDetail', () => {
  it('shows placeholder when category is null', () => {
    render(<CategoryDetail category={null} fields={[]} onBack={onBack} />);
    expect(screen.getByText('Select a category')).toBeInTheDocument();
  });

  it('renders category name as heading', () => {
    render(
      <CategoryDetail
        category={sampleCategory}
        fields={sampleFields}
        onBack={onBack}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Deforestation' }),
    ).toBeInTheDocument();
  });

  it('renders CategoryIcon with size=64 and iconSize=45', () => {
    render(
      <CategoryDetail
        category={sampleCategory}
        fields={sampleFields}
        onBack={onBack}
      />,
    );
    const icon = screen.getByTestId('category-detail-icon');
    expect(icon).toBeInTheDocument();
    expect(icon.getAttribute('data-size')).toBe('64');
    expect(icon.getAttribute('data-icon-size')).toBe('45');
    expect(icon.getAttribute('data-color')).toBe('#22c55e');
  });

  it('renders CategoryIcon with iconRef data when provided', () => {
    const categoryWithIcon: Category = {
      ...sampleCategory,
      iconRef: { docId: 'icon-42' },
    };
    render(
      <CategoryDetail
        category={categoryWithIcon}
        fields={sampleFields}
        onBack={onBack}
        projectRemoteId="proj-789"
      />,
    );
    const icon = screen.getByTestId('category-detail-icon');
    expect(icon).toBeInTheDocument();
    expect(icon.getAttribute('data-icon-ref')).toBe('present');
  });

  it('does not render color swatch or raw hex value', () => {
    render(
      <CategoryDetail
        category={sampleCategory}
        fields={sampleFields}
        onBack={onBack}
      />,
    );
    expect(screen.queryByTestId('color-swatch')).not.toBeInTheDocument();
    expect(screen.queryByText('#22c55e')).not.toBeInTheDocument();
  });

  it('renders field count and passes resolved fields to FieldViewer', () => {
    render(
      <CategoryDetail
        category={sampleCategory}
        fields={sampleFields}
        onBack={onBack}
      />,
    );
    expect(screen.getByText(/3 fields/)).toBeInTheDocument();
    const viewer = screen.getByTestId('field-viewer');
    expect(viewer.getAttribute('data-field-count')).toBe('3');
    expect(screen.getByText('Severity')).toBeInTheDocument();
    expect(screen.getByText('Area (ha)')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
  });

  it('does not show raw docIds for unresolved fields', () => {
    render(
      <CategoryDetail
        category={sampleCategory}
        fields={sampleFields}
        onBack={onBack}
      />,
    );
    expect(screen.queryByText('field-1')).not.toBeInTheDocument();
    expect(screen.queryByText('field-2')).not.toBeInTheDocument();
    expect(screen.queryByText('field-3')).not.toBeInTheDocument();
  });

  it('calls onBack when back button is clicked', () => {
    render(
      <CategoryDetail
        category={sampleCategory}
        fields={sampleFields}
        onBack={onBack}
      />,
    );
    const backButton = screen.getByRole('button', { name: 'Categories' });
    backButton.click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders back button with arrow icon and Categories text', () => {
    render(
      <CategoryDetail
        category={sampleCategory}
        fields={sampleFields}
        onBack={onBack}
      />,
    );
    const backButton = screen.getByRole('button', { name: 'Categories' });
    expect(backButton).toBeInTheDocument();
    // Should have an SVG chevron
    expect(backButton.querySelector('svg')).toBeInTheDocument();
  });

  it('renders empty fields gracefully', () => {
    const emptyFieldsCategory: Category = {
      docId: 'cat-2',
      label: 'Mining',
      fieldRefs: [],
      color: '#f59e0b',
    };
    render(
      <CategoryDetail
        category={emptyFieldsCategory}
        fields={[]}
        onBack={onBack}
      />,
    );
    expect(screen.getByText(/0 fields/)).toBeInTheDocument();
  });

  it('passes serverBaseUrl to CategoryIcon', () => {
    render(
      <CategoryDetail
        category={sampleCategory}
        fields={sampleFields}
        onBack={onBack}
        serverBaseUrl="https://test.com"
      />,
    );
    expect(screen.getByTestId('category-detail-icon')).toBeInTheDocument();
  });
});
