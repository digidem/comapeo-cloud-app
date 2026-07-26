import { describe, expect, it } from 'vitest';

import type {
  ApiField,
  ImportField,
  NormalizedField,
} from '@/lib/fields/normalize';
import {
  buildFieldLookup,
  normalizeApiField,
  normalizeImportField,
} from '@/lib/fields/normalize';

function createApiField(
  overrides: Partial<ApiField> & Pick<ApiField, 'docId'>,
): ApiField {
  return {
    schemaName: 'field',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    links: [],
    deleted: false,
    type: 'text',
    key: 'test_key',
    label: 'Test Field',
    universal: false,
    ...overrides,
  } satisfies ApiField;
}

describe('normalizeApiField', () => {
  it('maps key to tagKey', () => {
    const result = normalizeApiField(
      createApiField({ docId: 'f1', key: 'severity' }),
    );
    expect(result.tagKey).toBe('severity');
  });

  it('maps select_one type to selectOne', () => {
    const result = normalizeApiField(
      createApiField({ docId: 'f1', type: 'select_one' }),
    );
    expect(result.type).toBe('selectOne');
  });

  it('maps select_multiple type to selectMultiple', () => {
    const result = normalizeApiField(
      createApiField({ docId: 'f1', type: 'select_multiple' }),
    );
    expect(result.type).toBe('selectMultiple');
  });

  it('passes through text, textarea, number, date, datetime types unchanged', () => {
    for (const type of [
      'text',
      'textarea',
      'number',
      'date',
      'datetime',
    ] as const) {
      const result = normalizeApiField(createApiField({ docId: 'f1', type }));
      expect(result.type).toBe(type);
    }
  });

  it('defaults unknown types to text', () => {
    const result = normalizeApiField(
      createApiField({ docId: 'f1', type: 'unknown_type' as never }),
    );
    expect(result.type).toBe('text');
  });

  it('passes through placeholder and options', () => {
    const result = normalizeApiField(
      createApiField({
        docId: 'f1',
        placeholder: 'Enter value',
        options: [
          { label: 'Low', value: 'low' },
          { label: 'High', value: 'high' },
        ],
      }),
    );
    expect(result.placeholder).toBe('Enter value');
    expect(result.options).toEqual([
      { label: 'Low', value: 'low' },
      { label: 'High', value: 'high' },
    ]);
  });

  it('leaves helperText undefined (API format does not carry it)', () => {
    const result = normalizeApiField(createApiField({ docId: 'f1' }));
    expect(result.helperText).toBeUndefined();
  });

  it('preserves docId and label', () => {
    const result = normalizeApiField(
      createApiField({ docId: 'abc123', label: 'Severity' }),
    );
    expect(result.docId).toBe('abc123');
    expect(result.label).toBe('Severity');
  });
});

describe('normalizeImportField', () => {
  function createImportField(overrides: Partial<ImportField>): ImportField {
    return {
      tagKey: 'test_key',
      type: 'text',
      label: 'Test Field',
      ...overrides,
    } satisfies ImportField;
  }

  it('passes through camelCase type values unchanged', () => {
    for (const type of [
      'text',
      'selectOne',
      'selectMultiple',
      'date',
      'number',
    ] as const) {
      const result = normalizeImportField('doc-1', createImportField({ type }));
      expect(result.type).toBe(type);
    }
  });

  it('uses the provided docId', () => {
    const result = normalizeImportField(
      'import-doc-id',
      createImportField({ tagKey: 'severity' }),
    );
    expect(result.docId).toBe('import-doc-id');
  });

  it('passes through tagKey, label, helperText, and options', () => {
    const result = normalizeImportField(
      'doc-1',
      createImportField({
        tagKey: 'severity',
        label: 'Severity',
        helperText: 'How severe?',
        options: [
          { label: 'Low', value: 'low' },
          { label: 'High', value: 'high' },
        ],
      }),
    );
    expect(result.tagKey).toBe('severity');
    expect(result.label).toBe('Severity');
    expect(result.helperText).toBe('How severe?');
    expect(result.options).toEqual([
      { label: 'Low', value: 'low' },
      { label: 'High', value: 'high' },
    ]);
  });

  it('leaves placeholder undefined (import format does not carry it)', () => {
    const result = normalizeImportField(
      'doc-1',
      createImportField({ tagKey: 'severity' }),
    );
    expect(result.placeholder).toBeUndefined();
  });
});

describe('buildFieldLookup', () => {
  it('creates a map keyed by docId', () => {
    const fields = [
      createApiField({ docId: 'f1', key: 'severity' }),
      createApiField({ docId: 'f2', key: 'area' }),
    ];

    const lookup = buildFieldLookup(fields);

    expect(lookup.size).toBe(2);
    expect(lookup.get('f1')?.tagKey).toBe('severity');
    expect(lookup.get('f2')?.tagKey).toBe('area');
  });

  it('creates an alias entry using originalVersionId pointing to the same normalized field', () => {
    const fields = [
      createApiField({
        docId: 'field-v2',
        originalVersionId: 'field-original',
        key: 'severity',
      }),
    ];

    const lookup = buildFieldLookup(fields);

    expect(lookup.size).toBe(2);
    const byDocId = lookup.get('field-v2');
    const byOriginalId = lookup.get('field-original');
    expect(byDocId).toBeDefined();
    expect(byOriginalId).toBeDefined();
    // Both keys point to the same normalized field object
    expect(byDocId).toBe(byOriginalId);
    expect(byDocId?.docId).toBe('field-v2');
    expect(byDocId?.tagKey).toBe('severity');
  });

  it('does not create an alias entry when originalVersionId is absent', () => {
    const fields = [createApiField({ docId: 'standalone', key: 'notes' })];

    const lookup = buildFieldLookup(fields);

    expect(lookup.size).toBe(1);
    expect(lookup.has('standalone')).toBe(true);
  });

  it('normalizes fields via normalizeApiField when building the lookup', () => {
    const fields = [
      createApiField({
        docId: 'f1',
        key: 'category_type',
        type: 'select_one',
        label: 'Category',
      }),
    ];

    const lookup = buildFieldLookup(fields);

    const field = lookup.get('f1');
    expect(field).toBeDefined();
    expect(field?.tagKey).toBe('category_type');
    expect(field?.type).toBe('selectOne');
    expect(field?.label).toBe('Category');
  });

  it('handles empty input', () => {
    const lookup = buildFieldLookup([]);
    expect(lookup.size).toBe(0);
  });

  it('keeps helperText and placeholder as separate properties', () => {
    const fields = [
      createApiField({
        docId: 'f1',
        key: 'notes',
        placeholder: 'Enter notes',
      }),
    ];

    const lookup = buildFieldLookup(fields);

    const field: NormalizedField | undefined = lookup.get('f1');
    expect(field?.placeholder).toBe('Enter notes');
    expect(field?.helperText).toBeUndefined();
  });
});
