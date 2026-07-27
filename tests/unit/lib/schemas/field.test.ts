import realArchiveResponse from '@tests/fixtures/fields/real-archive-response.json';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { fieldSchema, fieldsResponseSchema } from '@/lib/schemas/field';

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
  it('defaults omitted timestamps to empty strings when parsing a field directly and in a fields response', () => {
    const timestampOmittingField = {
      docId: 'field-no-timestamps',
      versionId: 'field-no-timestamps/1',
      originalVersionId: 'field-no-timestamps-original',
      schemaName: 'field',
      links: [],
      deleted: false,
      type: 'text',
      tagKey: 'notes',
      label: 'Notes',
      universal: false,
    };

    const parsedField = v.parse(fieldSchema, timestampOmittingField);
    expect(parsedField.createdAt).toBe('');
    expect(parsedField.updatedAt).toBe('');

    const parsedResponse = v.parse(fieldsResponseSchema, {
      data: [timestampOmittingField],
    });
    expect(parsedResponse.data[0]?.createdAt).toBe('');
    expect(parsedResponse.data[0]?.updatedAt).toBe('');
  });

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
          tagKey: 'severity',
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
          tagKey: 'notes',
          label: 'Notes',
          universal: false,
          geometry: [],
          // `geometry` is not in the core contract — must be tolerated.
        },
      ],
    };

    expect(() => v.parse(fieldsResponseSchema, payload)).not.toThrow();
  });

  it('parses the real archive server /field response without throwing', () => {
    expect(() =>
      v.parse(fieldsResponseSchema, realArchiveResponse),
    ).not.toThrow();
  });

  it('preserves tagKey and camelCase type from the real server response', () => {
    const result = v.parse(fieldsResponseSchema, realArchiveResponse);

    const selectOneField = result.data.find(
      (f) => f.docId === 'field-select-one',
    );
    expect(selectOneField?.tagKey).toBe('autoridade-comunicada');
    expect(selectOneField?.type).toBe('selectOne');

    const selectMultipleField = result.data.find(
      (f) => f.docId === 'field-select-multiple',
    );
    expect(selectMultipleField?.tagKey).toBe('causa-do-risco');
    expect(selectMultipleField?.type).toBe('selectMultiple');
  });

  it('tolerates deleted fields in the real server response', () => {
    const result = v.parse(fieldsResponseSchema, realArchiveResponse);
    const deletedField = result.data.find(
      (f) => f.docId === 'field-deleted-text',
    );
    expect(deletedField?.deleted).toBe(true);
  });
});
