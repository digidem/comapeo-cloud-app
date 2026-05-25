import { alertsFixture } from '@tests/fixtures/alerts';
import { observationsFixture } from '@tests/fixtures/observations';
import {
  fieldsFixture,
  iconFixture,
  presetsFixture,
} from '@tests/fixtures/presets';
import { projectsFixture } from '@tests/fixtures/projects';
import { serverInfoFixture } from '@tests/fixtures/server-info';
import { HttpResponse, http } from 'msw';

import { VERSION_PREFIX } from '@/lib/invite-crypto';

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

  http.post('*/api/invites/encrypt', async ({ request }) => {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return HttpResponse.json(
        { error: { code: 'INVITE_BAD_JSON', message: 'Body must be JSON' } },
        { status: 400 },
      );
    }
    if (
      typeof body.url !== 'string' ||
      body.url.length === 0 ||
      typeof body.token !== 'string' ||
      body.token.length === 0
    ) {
      return HttpResponse.json(
        {
          error: {
            code: 'INVITE_BAD_INPUT',
            message: 'url and token are required',
          },
        },
        { status: 400 },
      );
    }
    const json = JSON.stringify(body);
    const base64 = btoa(json)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return HttpResponse.json({ code: `mock-encrypted-code-${base64}` });
  }),

  http.post('*/api/invites/decrypt', async ({ request }) => {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return HttpResponse.json(
        { error: { code: 'INVITE_BAD_JSON', message: 'Body must be JSON' } },
        { status: 400 },
      );
    }
    const code = body.code;
    if (typeof code !== 'string' || code.length === 0) {
      return HttpResponse.json(
        {
          error: { code: 'INVITE_BAD_INPUT', message: 'code is required' },
        },
        { status: 400 },
      );
    }
    // Strip v1. prefix for raw invite codes (issue #40)
    const strippedCode = code.startsWith(VERSION_PREFIX)
      ? code.slice(VERSION_PREFIX.length)
      : code;
    if (strippedCode === 'expired') {
      return HttpResponse.json(
        {
          error: {
            code: 'INVITE_EXPIRED',
            message: 'This invite has expired',
          },
        },
        { status: 410 },
      );
    }
    if (strippedCode === 'invalid') {
      return HttpResponse.json(
        {
          error: {
            code: 'INVITE_DECRYPT_FAILED',
            message: 'Invite code is invalid',
          },
        },
        { status: 400 },
      );
    }
    const prefix = 'mock-encrypted-code-';
    if (strippedCode.startsWith(prefix)) {
      const encoded = strippedCode.slice(prefix.length);
      try {
        const padLength = (4 - (encoded.length % 4)) % 4;
        const padded =
          encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLength);
        const json = atob(padded);
        const parsed = JSON.parse(json) as Record<string, unknown>;
        if (
          typeof parsed.url === 'string' &&
          typeof parsed.token === 'string'
        ) {
          return HttpResponse.json({ url: parsed.url, token: parsed.token });
        }
      } catch {
        // fall through
      }
    }
    return HttpResponse.json(
      {
        error: {
          code: 'INVITE_DECRYPT_FAILED',
          message: 'Invite code is invalid',
        },
      },
      { status: 400 },
    );
  }),

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

  http.get('*/projects/*/preset', ({ request }) => {
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
    return HttpResponse.json(presetsFixture);
  }),

  http.get('*/projects/*/field', ({ request }) => {
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
    return HttpResponse.json(fieldsFixture);
  }),

  http.get('*/projects/*/icon/*', ({ request }) => {
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
    return new HttpResponse(iconFixture, {
      status: 200,
      headers: { 'Content-Type': 'image/svg+xml' },
    });
  }),
];
