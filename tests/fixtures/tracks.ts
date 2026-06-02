export const tracksFixture = {
  data: [
    {
      docId: 'track-001',
      versionId: 'track-001/0',
      originalVersionId: 'track-001/0',
      schemaName: 'track' as const,
      createdAt: '2024-03-15T08:00:00Z',
      updatedAt: '2024-03-15T08:30:00Z',
      links: [],
      deleted: false,
      locations: [
        {
          coords: { latitude: -8.35, longitude: -55.45 },
          timestamp: '2024-03-15T08:00:00Z',
        },
        {
          coords: { latitude: -8.36, longitude: -55.44 },
          timestamp: '2024-03-15T08:10:00Z',
        },
        {
          coords: { latitude: -8.37, longitude: -55.43 },
          timestamp: '2024-03-15T08:20:00Z',
        },
      ],
      observationRefs: [
        {
          docId: 'obs-001',
          versionId: 'obs-001/0',
          url: '/projects/proj1/observation/obs-001',
        },
      ],
      tags: { device: 'gps-tracker' },
      presetRef: {
        docId: 'preset-001',
        versionId: 'preset-001/0',
        url: '/projects/proj1/preset/preset-001',
      },
    },
    {
      docId: 'track-002',
      versionId: 'track-002/0',
      originalVersionId: 'track-002/0',
      schemaName: 'track' as const,
      createdAt: '2024-03-14T10:00:00Z',
      updatedAt: '2024-03-14T10:30:00Z',
      links: [],
      deleted: false,
      locations: [
        {
          coords: { latitude: -8.4, longitude: -55.5 },
          timestamp: '2024-03-14T10:00:00Z',
        },
        {
          coords: { latitude: -8.41, longitude: -55.49 },
          timestamp: '2024-03-14T10:15:00Z',
        },
      ],
      observationRefs: [],
      tags: {},
    },
  ],
} as const;
