import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { presetSchema, presetsResponseSchema } from '@/lib/schemas/preset';

describe('presetSchema', () => {
  const validPreset = {
    docId: 'abc123',
    versionId: 'abc123/0',
    originalVersionId: 'abc123/0',
    schemaName: 'preset' as const,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    links: [],
    deleted: false,
    name: 'Deforestation',
    geometry: ['point', 'area'] as const,
    tags: { category: 'forest-risk' },
    addTags: {},
    removeTags: {},
    fieldRefs: [
      {
        docId: 'field-001',
        versionId: 'field-001/0',
        url: '/projects/proj1/field/field-001',
      },
    ],
    iconRef: { docId: 'icon-001', versionId: 'icon-001/0', url: '/icon' },
    color: '#FF5733',
    terms: [],
  };

  it('validates a complete preset', () => {
    const result = v.safeParse(presetSchema, validPreset);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.name).toBe('Deforestation');
      expect(result.output.color).toBe('#FF5733');
    }
  });

  it('rejects preset missing required name', () => {
    const { name: _name, ...rest } = validPreset;
    expect(v.safeParse(presetSchema, rest).success).toBe(false);
  });

  it('rejects preset with invalid color format (too short)', () => {
    const invalid = { ...validPreset, color: '#123' };
    expect(v.safeParse(presetSchema, invalid).success).toBe(false);
  });

  it('validates preset with optional fields omitted', () => {
    const minimal = {
      docId: 'abc',
      versionId: 'abc/0',
      originalVersionId: 'abc/0',
      schemaName: 'preset' as const,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      links: [],
      deleted: false,
      name: 'Minimal',
      geometry: ['point'],
      tags: {},
      addTags: {},
      removeTags: {},
      fieldRefs: [],
      terms: [],
    };
    // iconRef and color are optional
    expect(v.safeParse(presetSchema, minimal).success).toBe(true);
  });
});

describe('presetsResponseSchema', () => {
  it('validates a server presets response', () => {
    const response = {
      data: [
        {
          docId: 'p1',
          versionId: 'p1/0',
          originalVersionId: 'p1/0',
          schemaName: 'preset',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          links: [],
          deleted: false,
          name: 'Forest',
          geometry: ['point'],
          tags: {},
          addTags: {},
          removeTags: {},
          fieldRefs: [],
          terms: [],
        },
      ],
    };
    expect(v.safeParse(presetsResponseSchema, response).success).toBe(true);
  });

  it('rejects a response with missing data array', () => {
    expect(v.safeParse(presetsResponseSchema, { data: null }).success).toBe(
      false,
    );
  });
});
