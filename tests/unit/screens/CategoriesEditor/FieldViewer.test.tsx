import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { FieldViewer } from '@/screens/CategoriesEditor/FieldViewer';
import type { FieldInput } from '@/screens/CategoriesEditor/FieldViewer';

const textField: FieldInput = {
  docId: 'field-1',
  tagKey: 'species',
  type: 'text',
  label: 'Species Name',
};

const selectOneField: FieldInput = {
  docId: 'field-2',
  tagKey: 'threat_level',
  type: 'selectOne',
  label: 'Threat Level',
  options: [
    { label: 'Low', value: 'low' },
    { label: 'Medium', value: 'medium' },
    { label: 'High', value: 'high' },
  ],
};

const selectMultipleField: FieldInput = {
  docId: 'field-3',
  tagKey: 'observed_species',
  type: 'selectMultiple',
  label: 'Observed Species',
  options: [
    { label: 'Eagle', value: 'eagle' },
    { label: 'Jaguar', value: 'jaguar' },
  ],
};

const dateField: FieldInput = {
  docId: 'field-4',
  tagKey: 'observation_date',
  type: 'date',
  label: 'Observation Date',
};

const numberField: FieldInput = {
  docId: 'field-5',
  tagKey: 'tree_count',
  type: 'number',
  label: 'Tree Count',
};

const unknownField: FieldInput = {
  docId: 'field-6',
  tagKey: 'weird',
  type: 'custom_type',
  label: 'Custom Field',
};

describe('FieldViewer', () => {
  it('renders text field preview with label and tag key', () => {
    render(<FieldViewer fields={[textField]} />);
    expect(screen.getByText('Species Name')).toBeInTheDocument();
    expect(screen.getByText('species')).toBeInTheDocument();
  });

  it('renders select_one field with options as badges', () => {
    render(<FieldViewer fields={[selectOneField]} />);
    expect(screen.getByText('Threat Level')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('renders select_multiple field with options as badges', () => {
    render(<FieldViewer fields={[selectMultipleField]} />);
    expect(screen.getByText('Observed Species')).toBeInTheDocument();
    expect(screen.getByText('Eagle')).toBeInTheDocument();
    expect(screen.getByText('Jaguar')).toBeInTheDocument();
  });

  it('renders date field with date indicator', () => {
    render(<FieldViewer fields={[dateField]} />);
    expect(screen.getByText('Observation Date')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
  });

  it('renders number field with number indicator', () => {
    render(<FieldViewer fields={[numberField]} />);
    expect(screen.getByText('Tree Count')).toBeInTheDocument();
    expect(screen.getByText('Number')).toBeInTheDocument();
  });

  it('renders unknown type with fallback label', () => {
    render(<FieldViewer fields={[unknownField]} />);
    expect(screen.getByText('Custom Field')).toBeInTheDocument();
    expect(screen.getByText('Unknown type')).toBeInTheDocument();
  });

  it('renders multiple fields', () => {
    render(<FieldViewer fields={[textField, selectOneField, dateField]} />);
    expect(screen.getByText('Species Name')).toBeInTheDocument();
    expect(screen.getByText('Threat Level')).toBeInTheDocument();
    expect(screen.getByText('Observation Date')).toBeInTheDocument();
  });

  it('uses accessible list markup', () => {
    render(<FieldViewer fields={[textField, dateField]} />);
    const list = screen.getByRole('list');
    expect(list).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBe(2);
  });

  it('each field item has an accessible label', () => {
    render(<FieldViewer fields={[textField, selectOneField]} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveAccessibleName('Species Name');
    expect(items[1]).toHaveAccessibleName('Threat Level');
  });
});
