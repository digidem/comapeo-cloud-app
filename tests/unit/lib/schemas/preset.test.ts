import { loadDefaultCategoryFixtures } from '@tests/fixtures/categories';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import {
  categorySchema,
  comapeoCatSchema,
  fieldSchema,
  metadataSchema,
  presetSchema,
  presetsResponseSchema,
} from '@/lib/schemas/preset';

// --- Server wire-type schemas (existing) ---

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

  // Regression: commit d754c56 — fieldRefs must be urlRef objects, not plain strings
  it('rejects fieldRefs with plain strings (must be urlRef objects)', () => {
    const invalid = {
      ...validPreset,
      fieldRefs: ['just-a-string'],
    };
    expect(v.safeParse(presetSchema, invalid).success).toBe(false);
  });

  // Regression: presetRefSchema required 'url' but server omits it
  it('accepts fieldRefs without url (server omits url per comapeo-schema v1)', () => {
    const withoutUrl = {
      ...validPreset,
      fieldRefs: [{ docId: 'field-001', versionId: 'field-001/0' }],
    };
    expect(v.safeParse(presetSchema, withoutUrl).success).toBe(true);
  });

  it('accepts iconRef without url (server omits url per comapeo-schema v1)', () => {
    const withoutUrl = {
      ...validPreset,
      iconRef: { docId: 'icon-001', versionId: 'icon-001/0' },
    };
    expect(v.safeParse(presetSchema, withoutUrl).success).toBe(true);
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

// --- Import-file schemas (new for #143) ---

describe('metadataSchema', () => {
  it('validates metadata with name', () => {
    const result = v.safeParse(metadataSchema, {
      name: 'CoMapeo Default Categories',
    });
    expect(result.success).toBe(true);
  });

  it('accepts metadata with optional fields omitted', () => {
    const result = v.safeParse(metadataSchema, { name: 'Test' });
    expect(result.success).toBe(true);
  });

  it('accepts metadata with additional properties (extensible)', () => {
    const result = v.safeParse(metadataSchema, {
      name: 'Test',
      version: '1.0.0',
      extra: 'allowed',
    });
    expect(result.success).toBe(true);
  });

  it('rejects metadata missing name', () => {
    const result = v.safeParse(metadataSchema, {});
    expect(result.success).toBe(false);
  });
});

describe('fieldSchema (import format)', () => {
  const validTextField = {
    tagKey: 'name',
    type: 'text',
    label: 'Name',
    helperText: 'Common name of this thing',
  };

  const validSelectOneField = {
    tagKey: 'animal-type',
    type: 'selectOne',
    label: 'Animal type',
    helperText: 'What kind of animal?',
    options: [
      { label: 'Mammal', value: 'mammal' },
      { label: 'Bird', value: 'bird' },
    ],
  };

  const validSelectMultipleField = {
    tagKey: 'cultural-category',
    type: 'selectMultiple',
    label: 'Cultural activity',
    helperText: 'What type of cultural activity?',
    options: [
      { label: 'Archeology', value: 'archeology' },
      { label: 'History', value: 'history' },
    ],
  };

  it('validates a text field', () => {
    expect(v.safeParse(fieldSchema, validTextField).success).toBe(true);
  });

  it('validates a selectOne field with options', () => {
    expect(v.safeParse(fieldSchema, validSelectOneField).success).toBe(true);
  });

  it('validates a selectMultiple field with options', () => {
    expect(v.safeParse(fieldSchema, validSelectMultipleField).success).toBe(
      true,
    );
  });

  it('validates a date field', () => {
    const dateField = {
      tagKey: 'observation-date',
      type: 'date',
      label: 'Date',
      helperText: 'When was this observed?',
    };
    expect(v.safeParse(fieldSchema, dateField).success).toBe(true);
  });

  it('validates a number field', () => {
    const numberField = {
      tagKey: 'count',
      type: 'number',
      label: 'Count',
      helperText: 'How many?',
    };
    expect(v.safeParse(fieldSchema, numberField).success).toBe(true);
  });

  it('rejects field missing type', () => {
    const { type: _type, ...rest } = validTextField;
    expect(v.safeParse(fieldSchema, rest).success).toBe(false);
  });

  it('rejects field with invalid type value', () => {
    const invalid = { ...validTextField, type: 'invalid-type' };
    expect(v.safeParse(fieldSchema, invalid).success).toBe(false);
  });

  it('rejects field missing tagKey', () => {
    const { tagKey: _tagKey, ...rest } = validTextField;
    expect(v.safeParse(fieldSchema, rest).success).toBe(false);
  });

  it('rejects field missing label', () => {
    const { label: _label, ...rest } = validTextField;
    expect(v.safeParse(fieldSchema, rest).success).toBe(false);
  });

  it('accepts field with optional helperText omitted', () => {
    const minimal = {
      tagKey: 'notes',
      type: 'text',
      label: 'Notes',
    };
    expect(v.safeParse(fieldSchema, minimal).success).toBe(true);
  });

  it('accepts additional properties (extensible metadata)', () => {
    const extended = {
      ...validTextField,
      extraProp: 'allowed',
    };
    expect(v.safeParse(fieldSchema, extended).success).toBe(true);
  });
});

describe('categorySchema (import format)', () => {
  const validCategory = {
    name: 'Animal',
    icon: 'animal',
    color: '#9E2C54',
    fields: ['name', 'animal-type'],
    appliesTo: ['observation'],
    tags: {
      type: 'nature',
      nature: 'wildlife',
      wildlife: 'animal',
    },
  };

  it('validates a complete category', () => {
    const result = v.safeParse(categorySchema, validCategory);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.name).toBe('Animal');
      expect(result.output.icon).toBe('animal');
    }
  });

  it('rejects category missing name', () => {
    const { name: _name, ...rest } = validCategory;
    expect(v.safeParse(categorySchema, rest).success).toBe(false);
  });

  it('rejects category with invalid color format', () => {
    const invalid = { ...validCategory, color: 'not-a-color' };
    expect(v.safeParse(categorySchema, invalid).success).toBe(false);
  });

  it('rejects category missing icon', () => {
    const { icon: _icon, ...rest } = validCategory;
    expect(v.safeParse(categorySchema, rest).success).toBe(false);
  });

  it('rejects category with empty tags', () => {
    const invalid = { ...validCategory, tags: {} };
    expect(v.safeParse(categorySchema, invalid).success).toBe(false);
  });

  it('rejects category missing appliesTo', () => {
    const { appliesTo: _a, ...rest } = validCategory;
    expect(v.safeParse(categorySchema, rest).success).toBe(false);
  });

  it('rejects category with empty appliesTo', () => {
    const invalid = { ...validCategory, appliesTo: [] };
    expect(v.safeParse(categorySchema, invalid).success).toBe(false);
  });

  it('accepts additional properties (extensible metadata)', () => {
    const extended = {
      ...validCategory,
      extraProp: 'allowed',
    };
    expect(v.safeParse(categorySchema, extended).success).toBe(true);
  });
});

describe('comapeoCatSchema (import file envelope)', () => {
  const validPayload = {
    metadata: { name: 'CoMapeo Default Categories' },
    categorySelection: {
      observation: ['animal', 'plant'],
      track: ['roadway'],
    },
    categories: {
      animal: {
        name: 'Animal',
        icon: 'animal',
        color: '#9E2C54',
        fields: ['name'],
        appliesTo: ['observation'],
        tags: { type: 'nature', nature: 'wildlife' },
      },
    },
    fields: {
      name: {
        tagKey: 'name',
        type: 'text',
        label: 'Name',
      },
    },
  };

  it('validates a complete .comapeocat payload', () => {
    expect(v.safeParse(comapeoCatSchema, validPayload).success).toBe(true);
  });

  it('rejects payload missing categories', () => {
    const { categories: _c, ...rest } = validPayload;
    expect(v.safeParse(comapeoCatSchema, rest).success).toBe(false);
  });

  it('rejects payload missing fields', () => {
    const { fields: _f, ...rest } = validPayload;
    expect(v.safeParse(comapeoCatSchema, rest).success).toBe(false);
  });

  it('validates payload without metadata (optional)', () => {
    const { metadata: _m, ...rest } = validPayload;
    expect(v.safeParse(comapeoCatSchema, rest).success).toBe(true);
  });
});

// --- Upstream fixture validation ---

describe('upstream default category fixtures', () => {
  const fixtures = loadDefaultCategoryFixtures();

  it('loads representative fixtures', () => {
    expect(Object.keys(fixtures.categories).length).toBeGreaterThanOrEqual(3);
  });

  it.each(Object.keys(fixtures.categories))(
    'category "%s" parses successfully',
    (key) => {
      const result = v.safeParse(categorySchema, fixtures.categories[key]);
      expect(result.success).toBe(true);
    },
  );

  it.each(Object.keys(fixtures.fields))(
    'field "%s" parses successfully',
    (key) => {
      const result = v.safeParse(fieldSchema, fixtures.fields[key]);
      expect(result.success).toBe(true);
    },
  );

  it('metadata parses successfully', () => {
    expect(v.safeParse(metadataSchema, fixtures.metadata).success).toBe(true);
  });

  it('field types cover all supported variants', () => {
    const types = new Set(Object.values(fixtures.fields).map((f) => f.type));
    expect(types.has('text')).toBe(true);
    expect(types.has('selectOne')).toBe(true);
    expect(types.has('selectMultiple')).toBe(true);
  });

  it('category tags always include type key', () => {
    for (const cat of Object.values(fixtures.categories)) {
      expect(cat.tags.type).toBeDefined();
      expect(typeof cat.tags.type).toBe('string');
    }
  });

  it('categories reference valid field keys', () => {
    const fieldKeys = new Set(Object.keys(fixtures.fields));
    for (const [_catKey, cat] of Object.entries(fixtures.categories)) {
      for (const fieldRef of cat.fields) {
        expect(fieldKeys.has(fieldRef)).toBe(true);
      }
    }
  });
});
