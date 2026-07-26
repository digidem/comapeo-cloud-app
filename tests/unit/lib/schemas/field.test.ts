import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { fieldsResponseSchema } from '@/lib/schemas/field';

/**
 * These tests pin the REAL server wire contract for the `/field` endpoint.
 * The working `preset` schema is `v.looseObject` (tolerant of forward-
 * compatible keys); the original `field` schema was an unforgiving `v.object`
 * that rejected fields that omit optional keys (e.g. `universal`) or carry
 * extra server keys (e.g. `geometry`), which made the whole categories screen
 * fail to load with an unhandled parse error. These tests must stay RED until
 * the field schema is tolerant, and must stay GREEN afterwards.
 */
describe('fieldsResponseSchema — real server contract', () => {
  it('parses a server field that omits optional keys (universal, placeholder, geometry)', () => {
    const payload = {
      data: [
        {
          docId: 'field-abc',
          versionId: 'field-abc/1',
          originalVersionId: 'field-orig',
          schemaName: 'field',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
          links: [],
          deleted: false,
          type: 'select_one',
          key: 'severity',
          label: 'Severity',
          options: [
            { label: 'Low', value: 'low' },
            { label: 'High', value: 'high' },
          ],
          // Real server responses omit `universal` / `placeholder` /
          // `geometry` — the schema must tolerate that.
        },
      ],
    };

    const result = v.parse(fieldsResponseSchema, payload);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.docId).toBe('field-abc');
  });

  it('parses a server field that carries extra forward-compatible keys', () => {
    const payload = {
      data: [
        {
          docId: 'field-xyz',
          versionId: 'field-xyz/1',
          schemaName: 'field',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
          links: [],
          deleted: false,
          type: 'text',
          key: 'notes',
          label: 'Notes',
          universal: false,
          geometry: [],
          // `geometry` is not in the core contract — must be tolerated.
        },
      ],
    };

    expect(() => v.parse(fieldsResponseSchema, payload)).not.toThrow();
  });
});
