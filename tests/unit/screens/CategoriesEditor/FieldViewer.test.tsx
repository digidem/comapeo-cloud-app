import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import type { NormalizedField } from '@/lib/fields/normalize';
import { FieldViewer } from '@/screens/CategoriesEditor/FieldViewer';

const textField: NormalizedField = {
  docId: 'field-1',
  tagKey: 'species',
  type: 'text',
  label: 'Species Name',
};

const textareaField: NormalizedField = {
  docId: 'field-2',
  tagKey: 'description',
  type: 'textarea',
  label: 'Description',
};

const selectOneField: NormalizedField = {
  docId: 'field-3',
  tagKey: 'threat_level',
  type: 'selectOne',
  label: 'Threat Level',
  options: [
    { label: 'Low', value: 'low' },
    { label: 'Medium', value: 'medium' },
    { label: 'High', value: 'high' },
  ],
};

const selectMultipleField: NormalizedField = {
  docId: 'field-4',
  tagKey: 'observed_species',
  type: 'selectMultiple',
  label: 'Observed Species',
  options: [
    { label: 'Eagle', value: 'eagle' },
    { label: 'Jaguar', value: 'jaguar' },
  ],
};

const dateField: NormalizedField = {
  docId: 'field-5',
  tagKey: 'observation_date',
  type: 'date',
  label: 'Observation Date',
};

const datetimeField: NormalizedField = {
  docId: 'field-6',
  tagKey: 'observation_datetime',
  type: 'datetime',
  label: 'Observation DateTime',
};

const numberField: NormalizedField = {
  docId: 'field-7',
  tagKey: 'tree_count',
  type: 'number',
  label: 'Tree Count',
};

const fieldWithHelperText: NormalizedField = {
  docId: 'field-8',
  tagKey: 'notes',
  type: 'text',
  label: 'Notes',
  helperText: 'Enter any additional notes here',
};

const fieldWithPlaceholder: NormalizedField = {
  docId: 'field-9',
  tagKey: 'location',
  type: 'text',
  label: 'Location',
  placeholder: 'e.g. Near the river',
};

describe('FieldViewer', () => {
  it('renders text field with label and type badge', () => {
    render(<FieldViewer fields={[textField]} />);
    expect(screen.getByText('Species Name')).toBeInTheDocument();
    expect(screen.getByText('Text')).toBeInTheDocument();
  });

  it('renders textarea field with label and type badge', () => {
    render(<FieldViewer fields={[textareaField]} />);
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Long text')).toBeInTheDocument();
  });

  it('renders selectOne field with options as badges', () => {
    render(<FieldViewer fields={[selectOneField]} />);
    expect(screen.getByText('Threat Level')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('renders selectMultiple field with options as badges', () => {
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

  it('renders datetime field with datetime indicator', () => {
    render(<FieldViewer fields={[datetimeField]} />);
    expect(screen.getByText('Observation DateTime')).toBeInTheDocument();
    expect(screen.getByText('Date and time')).toBeInTheDocument();
  });

  it('renders number field with number indicator', () => {
    render(<FieldViewer fields={[numberField]} />);
    expect(screen.getByText('Tree Count')).toBeInTheDocument();
    expect(screen.getByText('Number')).toBeInTheDocument();
  });

  it('renders helperText below label when present', () => {
    render(<FieldViewer fields={[fieldWithHelperText]} />);
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(
      screen.getByText('Enter any additional notes here'),
    ).toBeInTheDocument();
  });

  it('renders placeholder as subtle hint when present', () => {
    render(<FieldViewer fields={[fieldWithPlaceholder]} />);
    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.getByText('e.g. Near the river')).toBeInTheDocument();
  });

  it('does not render raw tagKey', () => {
    render(<FieldViewer fields={[textField]} />);
    expect(screen.queryByText('species')).not.toBeInTheDocument();
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

  it('renders nothing when fields array is empty', () => {
    const { container } = render(<FieldViewer fields={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows Field unavailable for empty label', () => {
    const unavailableField: NormalizedField = {
      docId: 'field-10',
      tagKey: 'missing',
      type: 'text',
      label: '',
    };
    render(<FieldViewer fields={[unavailableField]} />);
    expect(screen.getByText('Field unavailable')).toBeInTheDocument();
  });
});
