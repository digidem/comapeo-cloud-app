import realArchiveResponse from '@tests/fixtures/fields/real-archive-response.json';
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
    tagKey: 'test_key',
    label: 'Test Field',
    universal: false,
    ...overrides,
  } satisfies ApiField;
}

describe('normalizeApiField', () => {
  it('maps tagKey to tagKey', () => {
    const result = normalizeApiField(
      createApiField({ docId: 'f1', tagKey: 'severity' }),
    );
    expect(result.tagKey).toBe('severity');
  });

  it('falls back to legacy key when tagKey is absent (back-compat)', () => {
    const result = normalizeApiField({
      ...createApiField({ docId: 'f1' }),
      tagKey: undefined as unknown as string,
      key: 'severity',
    });
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

  describe('real archive server response (tagKey + camelCase type)', () => {
    const realFields = realArchiveResponse.data as unknown as ApiField[];

    it('maps tagKey to tagKey (not the legacy key property)', () => {
      const selectOneField = realFields.find(
        (f) => f.docId === 'field-select-one',
      )!;
      const result = normalizeApiField(selectOneField);
      expect(result.tagKey).toBe('autoridade-comunicada');
    });

    it('maps camelCase selectOne type unchanged', () => {
      const selectOneField = realFields.find(
        (f) => f.docId === 'field-select-one',
      )!;
      const result = normalizeApiField(selectOneField);
      expect(result.type).toBe('selectOne');
    });

    it('maps camelCase selectMultiple type unchanged', () => {
      const selectMultipleField = realFields.find(
        (f) => f.docId === 'field-select-multiple',
      )!;
      const result = normalizeApiField(selectMultipleField);
      expect(result.type).toBe('selectMultiple');
    });

    it('preserves the real label for a text field', () => {
      const textField = realFields.find((f) => f.docId === 'field-text')!;
      const result = normalizeApiField(textField);
      expect(result.tagKey).toBe('espcie');
      expect(result.type).toBe('text');
      expect(result.label).toBe('Espécie');
    });
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
      createApiField({ docId: 'f1', tagKey: 'severity' }),
      createApiField({ docId: 'f2', tagKey: 'area' }),
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
        tagKey: 'severity',
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

  it('omits deleted fields and originalVersionId aliases by default while resolving active fields', () => {
    const fields = [
      createApiField({ docId: 'active-field', tagKey: 'active_key' }),
      createApiField({
        docId: 'deleted-field-v2',
        originalVersionId: 'deleted-field-original',
        deleted: true,
        tagKey: 'deleted_key',
      }),
    ];

    const lookup = buildFieldLookup(fields);

    expect(lookup.get('active-field')?.tagKey).toBe('active_key');
    expect(lookup.has('deleted-field-v2')).toBe(false);
    expect(lookup.has('deleted-field-original')).toBe(false);
  });

  it('includes deleted fields and originalVersionId aliases when includeDeleted is true', () => {
    const fields = [
      createApiField({
        docId: 'deleted-field-v2',
        originalVersionId: 'deleted-field-original',
        deleted: true,
        tagKey: 'deleted_key',
      }),
    ];

    const lookup = buildFieldLookup(fields, { includeDeleted: true });

    const byDocId = lookup.get('deleted-field-v2');
    const byOriginalId = lookup.get('deleted-field-original');
    expect(byDocId).toBeDefined();
    expect(byOriginalId).toBeDefined();
    expect(byDocId).toBe(byOriginalId);
    expect(byDocId?.docId).toBe('deleted-field-v2');
    expect(byDocId?.tagKey).toBe('deleted_key');
  });

  it('does not create an alias entry when originalVersionId is absent', () => {
    const fields = [createApiField({ docId: 'standalone', tagKey: 'notes' })];

    const lookup = buildFieldLookup(fields);

    expect(lookup.size).toBe(1);
    expect(lookup.has('standalone')).toBe(true);
  });

  it('normalizes fields via normalizeApiField when building the lookup', () => {
    const fields = [
      createApiField({
        docId: 'f1',
        tagKey: 'category_type',
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
        tagKey: 'notes',
        placeholder: 'Enter notes',
      }),
    ];

    const lookup = buildFieldLookup(fields);

    const field: NormalizedField | undefined = lookup.get('f1');
    expect(field?.placeholder).toBe('Enter notes');
    expect(field?.helperText).toBeUndefined();
  });

  it('resolves real archive server fields (tagKey + camelCase type) to correct labels', () => {
    const realFields = realArchiveResponse.data as unknown as ApiField[];
    const lookup = buildFieldLookup(realFields);

    expect(lookup.get('field-text')?.label).toBe('Espécie');
    expect(lookup.get('field-select-one')?.label).toBe('Autoridade comunicada');
    expect(lookup.get('field-select-one')?.type).toBe('selectOne');
    expect(lookup.get('field-select-multiple')?.label).toBe('Causa do risco');
    expect(lookup.get('field-select-multiple')?.type).toBe('selectMultiple');
  });
});
