import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { fieldSchema, fieldsResponseSchema } from '@/lib/schemas/field';

describe('fieldSchema', () => {
  const validField = {
    docId: 'field-001',
    versionId: 'field-001/0',
    originalVersionId: 'field-001/0',
    schemaName: 'field' as const,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    links: [],
    deleted: false,
    type: 'text' as const,
    key: 'notes',
    label: 'Notes',
    placeholder: 'Enter notes...',
    universal: false,
  };

  it('validates a complete field', () => {
    const result = v.safeParse(fieldSchema, validField);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.key).toBe('notes');
      expect(result.output.type).toBe('text');
    }
  });

  it('rejects field missing type', () => {
    const { type: _type, ...rest } = validField;
    expect(v.safeParse(fieldSchema, rest).success).toBe(false);
  });

  it('validates field with array options (select_multiple)', () => {
    const selectField = {
      ...validField,
      type: 'select_multiple',
      options: [
        { label: 'Option A', value: 'a' },
        { label: 'Option B', value: 'b' },
      ],
    };
    expect(v.safeParse(fieldSchema, selectField).success).toBe(true);
  });
});

describe('fieldsResponseSchema', () => {
  it('validates a server fields response', () => {
    const response = {
      data: [
        {
          docId: 'f1',
          versionId: 'f1/0',
          originalVersionId: 'f1/0',
          schemaName: 'field',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          links: [],
          deleted: false,
          type: 'text',
          key: 'notes',
          label: 'Notes',
          universal: false,
        },
      ],
    };
    expect(v.safeParse(fieldsResponseSchema, response).success).toBe(true);
  });
});
