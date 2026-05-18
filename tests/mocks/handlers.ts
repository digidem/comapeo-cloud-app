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

  http.get('*/projects/:projectId', ({ request, params }) => {
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
    const { projectId } = params;
    const project = projectsFixture.data.find((p) => p.projectId === projectId);
    if (!project) {
      return HttpResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Project not found' } },
        { status: 404 },
      );
    }
    return HttpResponse.json({ data: project });
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

  http.get(
    '*/projects/*/observations/:observationId',
    ({ request, params }) => {
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
      const { observationId } = params;
      const observation = observationsFixture.data.find(
        (o) => o.docId === observationId,
      );
      if (!observation) {
        return HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Observation not found' } },
          { status: 404 },
        );
      }
      return HttpResponse.json({ data: observation });
    },
  ),

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

  http.get(
    '*/projects/*/remoteDetectionAlerts/:alertId',
    ({ request, params }) => {
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
      const { alertId } = params;
      const alert = alertsFixture.data.find((a) => a.docId === alertId);
      if (!alert) {
        return HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Alert not found' } },
          { status: 404 },
        );
      }
      return HttpResponse.json({ data: alert });
    },
  ),

  http.post('*/projects/*/remoteDetectionAlerts', async ({ request }) => {
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
    // Validate body has geometry
    const body = (await request.json()) as Record<string, unknown>;
    if (!body.geometry) {
      return HttpResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'geometry is required' } },
        { status: 400 },
      );
    }
    return new HttpResponse(null, { status: 201 });
  }),
];
