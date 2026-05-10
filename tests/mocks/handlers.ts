import { alertsFixture } from '@tests/fixtures/alerts';
import { observationsFixture } from '@tests/fixtures/observations';
import { projectsFixture } from '@tests/fixtures/projects';
import { serverInfoFixture } from '@tests/fixtures/server-info';
import { HttpResponse, http } from 'msw';

export const handlers = [
  http.get('*/info', () => {
    return HttpResponse.json(serverInfoFixture);
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
    return HttpResponse.json(projectsFixture);
  }),

  http.get('*/projects/*/observations', ({ request }) => {
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
    return HttpResponse.json(observationsFixture);
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
    return HttpResponse.json(alertsFixture);
  }),
];
