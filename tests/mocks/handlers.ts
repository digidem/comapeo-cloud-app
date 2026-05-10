import { HttpResponse, http } from 'msw';

export const handlers = [
  http.get('*/info', () => {
    return HttpResponse.json({
      data: { deviceId: 'test-device-id', name: 'Test Server' },
    });
  }),

  http.get('*/healthcheck', () => {
    return new HttpResponse(null, { status: 200 });
  }),

  http.get('*/projects', ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return HttpResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid bearer token',
          },
        },
        { status: 401 },
      );
    }
    return HttpResponse.json({
      data: [
        { projectId: 'test-project-id-1', name: 'Test Project 1' },
        { projectId: 'test-project-id-2' },
      ],
    });
  }),

  http.get('*/projects/*/remoteDetectionAlerts', ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return HttpResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid bearer token',
          },
        },
        { status: 401 },
      );
    }
    return HttpResponse.json({
      data: [
        {
          docId: 'test-alert-id-1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          deleted: false,
          geometry: { type: 'Point', coordinates: [0, 0] },
        },
      ],
    });
  }),
];
