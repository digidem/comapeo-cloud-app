export const observationsFixture = {
  data: [
    {
      docId: 'obs-001',
      createdAt: '2024-03-15T10:30:00Z',
      updatedAt: '2024-03-15T10:30:00Z',
      deleted: false,
      lat: -8.35,
      lon: -55.45,
      attachments: [
        {
          url: 'https://example.com/projects/proj1/attachments/drive1/photo/img1',
        },
        {
          url: 'https://example.com/projects/proj1/attachments/drive2/photo/img2',
        },
        {
          url: 'https://example.com/projects/proj1/attachments/drive3/audio/rec1',
        },
      ],
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
    {
      docId: 'obs-003',
      createdAt: '2024-03-13T09:00:00Z',
      updatedAt: '2024-03-13T09:00:00Z',
      deleted: false,
      lat: -8.36,
      lon: -55.44,
      attachments: [
        {
          url: 'https://example.com/projects/proj1/attachments/drive4/photo/img3',
        },
      ],
      tags: { category: 'wildlife', notes: 'Jaguar sighting' },
    },
  ],
} as const;
