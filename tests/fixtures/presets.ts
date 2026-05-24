export const presetsFixture = {
  data: [
    {
      docId: 'preset-001',
      versionId: 'preset-001/0',
      originalVersionId: 'preset-001/0',
      schemaName: 'preset' as const,
      createdAt: '2024-03-15T10:00:00Z',
      updatedAt: '2024-03-15T10:00:00Z',
      links: [],
      deleted: false,
      name: 'Deforestation',
      geometry: ['point', 'area'] as const,
      tags: { category: 'forest' },
      addTags: {},
      removeTags: {},
      fieldRefs: [
        {
          docId: 'field-001',
          versionId: 'field-001/0',
          url: '/projects/proj1/field/field-001',
        },
      ],
      iconRef: {
        docId: 'icon-001',
        versionId: 'icon-001/0',
        url: '/projects/proj1/icon/icon-001',
      },
      color: '#FF5733',
      terms: ['logging', 'clear-cut'],
    },
    {
      docId: 'preset-002',
      versionId: 'preset-002/0',
      originalVersionId: 'preset-002/0',
      schemaName: 'preset' as const,
      createdAt: '2024-03-14T14:00:00Z',
      updatedAt: '2024-03-14T14:00:00Z',
      links: [],
      deleted: false,
      name: 'Water Contamination',
      geometry: ['point'] as const,
      tags: { category: 'water-risk' },
      addTags: {},
      removeTags: {},
      fieldRefs: [],
      color: '#3357FF',
      terms: ['river', 'pollution'],
    },
  ],
} as const;

export const fieldsFixture = {
  data: [
    {
      docId: 'field-001',
      versionId: 'field-001/0',
      originalVersionId: 'field-001/0',
      schemaName: 'field' as const,
      createdAt: '2024-03-15T10:00:00Z',
      updatedAt: '2024-03-15T10:00:00Z',
      links: [],
      deleted: false,
      type: 'text' as const,
      key: 'notes',
      label: 'Notes',
      placeholder: 'Enter notes...',
      universal: false,
    },
  ],
} as const;

// Icon fixture used as Blob by MSW handlers
export const iconFixture = new Blob(['<svg>...</svg>'], {
  type: 'image/svg+xml',
});
