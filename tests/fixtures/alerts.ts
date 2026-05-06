export const alertsFixture = {
  data: [
    {
      docId: 'alert-001',
      createdAt: '2024-03-15T08:00:00Z',
      updatedAt: '2024-03-15T08:00:00Z',
      deleted: false,
      detectionDateStart: '2024-03-14T00:00:00Z',
      detectionDateEnd: '2024-03-15T00:00:00Z',
      sourceId: 'source-1',
      metadata: { severity: 'high', type: 'deforestation' },
      geometry: {
        type: 'Point',
        coordinates: [-55.45, -8.35],
      },
    },
  ],
} as const;
