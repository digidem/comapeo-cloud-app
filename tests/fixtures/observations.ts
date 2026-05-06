export const observationsFixture = {
  data: [
    {
      docId: 'obs-001',
      createdAt: '2024-03-15T10:30:00Z',
      updatedAt: '2024-03-15T10:30:00Z',
      deleted: false,
      lat: -8.35,
      lon: -55.45,
      attachments: [{ url: '/attachments/photo1.jpg' }],
      tags: { category: 'forest', notes: 'Deforestation detected' },
    },
    {
      docId: 'obs-002',
      createdAt: '2024-03-14T14:20:00Z',
      updatedAt: '2024-03-14T14:20:00Z',
      deleted: false,
      attachments: [],
      tags: { category: 'water', notes: 'River contamination' },
    },
  ],
} as const;
