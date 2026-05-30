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
          driveId: 'drive1',
          type: 'photo',
          name: 'img1',
          url: 'https://example.com/projects/proj1/attachments/drive1/photo/img1',
        },
        {
          driveId: 'drive2',
          type: 'photo',
          name: 'img2',
          url: 'https://example.com/projects/proj1/attachments/drive2/photo/img2',
        },
        {
          driveId: 'drive3',
          type: 'audio',
          name: 'rec1',
          url: 'https://example.com/projects/proj1/attachments/drive3/audio/rec1',
        },
      ],
      metadata: { source: 'mobile' },
      tags: { category: 'forest', notes: 'Deforestation detected' },
      presetRef: {
        docId: 'preset-001',
        versionId: 'preset-001/0',
        url: '/projects/proj1/preset/preset-001',
      },
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
          driveId: 'drive4',
          type: 'photo',
          name: 'img3',
          url: 'https://example.com/projects/proj1/attachments/drive4/photo/img3',
        },
      ],
      tags: { category: 'wildlife', notes: 'Jaguar sighting' },
    },
  ],
} as const;
