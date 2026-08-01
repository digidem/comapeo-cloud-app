import * as v from 'valibot';

import {
  ARCHIVE_TARGET_HEADER,
  normalizeArchiveBaseUrl,
} from '@/lib/archive-proxy';
import {
  alertsResponseSchema,
  createAlertBodySchema,
  errorResponseSchema,
  fieldsResponseSchema,
  observationsResponseSchema,
  presetsResponseSchema,
  projectDetailResponseSchema,
  projectsResponseSchema,
  serverInfoResponseSchema,
  tracksResponseSchema,
} from '@/lib/schemas';
import {
  type AuthIdentity,
  selectActiveBaseUrl,
  selectActiveServer,
  selectActiveToken,
  useAuthStore,
} from '@/stores/auth-store';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Canonical path for remote detection alerts, matching comapeo-cloud server. */
export const ALERTS_PATH = '/remoteDetectionAlerts' as const;

// ---------------------------------------------------------------------------
// RequestConfig — explicit credentials for remote archive calls
// ---------------------------------------------------------------------------

export interface RequestConfig {
  baseUrl: string;
  token: string;
}

type RequestCredentials = AuthIdentity;

// ---------------------------------------------------------------------------
// ApiError
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export class NetworkError extends Error {
  constructor(message = 'Unable to connect') {
    super(message);
    this.name = 'NetworkError';
  }
}

// ---------------------------------------------------------------------------
// Request resolution — determines baseUrl and extra headers per request
// ---------------------------------------------------------------------------

interface ApiRuntimeEnv {
  readonly VITEST?: boolean;
}

export function resolveApiRequest(
  config?: RequestConfig,
  env?: ApiRuntimeEnv,
): { baseUrl: string; extraHeaders: Record<string, string> } {
  const isVitest = env ? !!env.VITEST : !!import.meta.env.VITEST;
  if (config?.baseUrl) {
    if (!isVitest) {
      const normalized = normalizeArchiveBaseUrl(config.baseUrl);
      return {
        baseUrl: '/api',
        extraHeaders: {
          [ARCHIVE_TARGET_HEADER]: normalized.ok
            ? normalized.value
            : config.baseUrl,
        },
      };
    }
    return { baseUrl: config.baseUrl, extraHeaders: {} };
  }

  const baseUrl = selectActiveBaseUrl(useAuthStore.getState());
  if (baseUrl) return { baseUrl, extraHeaders: {} };
  return { baseUrl: window.location.origin, extraHeaders: {} };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveRequestCredentials(config?: RequestConfig): RequestCredentials {
  const state = useAuthStore.getState();
  return {
    activeServerId: selectActiveServer(state)?.id ?? null,
    baseUrl: config?.baseUrl ?? selectActiveBaseUrl(state),
    token: config?.token ?? selectActiveToken(state),
  };
}

function getAuthHeaders(
  credentials: RequestCredentials,
): Record<string, string> {
  const { token } = credentials;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

const NETWORK_ERROR_RE = /failed to fetch|networkerror|load failed/i;

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError && NETWORK_ERROR_RE.test(error.message);
}

function throwNetworkError(): never {
  throw new NetworkError();
}

/**
 * Handle 401 responses: clear the active session only when the failing
 * request matches the active credentials exactly. Prevents a stale
 * configured token (e.g. from a different archive server) from clearing
 * a valid active session.
 */
async function handle401(
  requestCredentials: RequestCredentials,
): Promise<void> {
  await useAuthStore.getState().clearAuth(requestCredentials);
}

async function handleResponse<T>(
  response: Response,
  schema: v.GenericSchema<T>,
  requestCredentials: RequestCredentials,
): Promise<T> {
  if (response.status === 401) {
    await handle401(requestCredentials);
  }

  if (!response.ok) {
    let code = 'UNKNOWN';
    let message = `Request failed with status ${response.status}`;

    try {
      const body = await response.json();
      const parsed = v.safeParse(errorResponseSchema, body);
      if (parsed.success) {
        code = parsed.output.error.code;
        message = parsed.output.error.message;
      }
    } catch {
      // Response body is not JSON or unparseable — keep defaults
    }

    throw new ApiError(response.status, code, message);
  }

  const body: unknown = await response.json();
  return v.parse(schema, body);
}

// ---------------------------------------------------------------------------
// ApiClient
// ---------------------------------------------------------------------------

export const apiClient = {
  async getServerInfo(config?: RequestConfig) {
    try {
      const credentials = resolveRequestCredentials(config);
      const request = resolveApiRequest(config);
      const response = await fetch(`${request.baseUrl}/info`, {
        headers: { ...request.extraHeaders },
        cache: 'no-store',
      });
      return handleResponse(response, serverInfoResponseSchema, credentials);
    } catch (error) {
      if (isNetworkError(error)) throwNetworkError();
      throw error;
    }
  },

  async healthCheck(config?: RequestConfig): Promise<boolean> {
    try {
      const request = resolveApiRequest(config);
      const response = await fetch(`${request.baseUrl}/healthcheck`, {
        headers: { ...request.extraHeaders },
      });
      return response.status === 200;
    } catch {
      return false;
    }
  },

  async getProjects(config?: RequestConfig) {
    try {
      const credentials = resolveRequestCredentials(config);
      const request = resolveApiRequest(config);
      const response = await fetch(`${request.baseUrl}/projects`, {
        headers: { ...getAuthHeaders(credentials), ...request.extraHeaders },
        cache: 'no-store',
      });
      return handleResponse(response, projectsResponseSchema, credentials);
    } catch (error) {
      if (isNetworkError(error)) throwNetworkError();
      throw error;
    }
  },

  async getProject(projectId: string, config?: RequestConfig) {
    try {
      const credentials = resolveRequestCredentials(config);
      const request = resolveApiRequest(config);
      const response = await fetch(
        `${request.baseUrl}/projects/${encodeURIComponent(projectId)}`,
        {
          headers: { ...getAuthHeaders(credentials), ...request.extraHeaders },
          cache: 'no-store',
        },
      );
      return handleResponse(response, projectDetailResponseSchema, credentials);
    } catch (error) {
      if (isNetworkError(error)) throwNetworkError();
      throw error;
    }
  },

  async getObservations(projectId: string, config?: RequestConfig) {
    try {
      const credentials = resolveRequestCredentials(config);
      const request = resolveApiRequest(config);
      const response = await fetch(
        `${request.baseUrl}/projects/${encodeURIComponent(projectId)}/observations`,
        {
          headers: { ...getAuthHeaders(credentials), ...request.extraHeaders },
          cache: 'no-store',
        },
      );
      return handleResponse(response, observationsResponseSchema, credentials);
    } catch (error) {
      if (isNetworkError(error)) throwNetworkError();
      throw error;
    }
  },

  async getTracks(projectId: string, config?: RequestConfig) {
    try {
      const credentials = resolveRequestCredentials(config);
      const request = resolveApiRequest(config);
      const response = await fetch(
        `${request.baseUrl}/projects/${encodeURIComponent(projectId)}/track`,
        {
          headers: { ...getAuthHeaders(credentials), ...request.extraHeaders },
          cache: 'no-store',
        },
      );
      return await handleResponse(response, tracksResponseSchema, credentials);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        console.warn(
          `Track endpoint not found for project ${projectId} — legacy server may not support /track`,
        );
        return { data: [] };
      }
      if (isNetworkError(error)) throwNetworkError();
      throw error;
    }
  },

  async getAlerts(projectId: string, config?: RequestConfig) {
    try {
      const credentials = resolveRequestCredentials(config);
      const request = resolveApiRequest(config);
      const response = await fetch(
        `${request.baseUrl}/projects/${encodeURIComponent(projectId)}${ALERTS_PATH}`,
        {
          headers: { ...getAuthHeaders(credentials), ...request.extraHeaders },
          cache: 'no-store',
        },
      );
      return handleResponse(response, alertsResponseSchema, credentials);
    } catch (error) {
      if (isNetworkError(error)) throwNetworkError();
      throw error;
    }
  },

  async createAlert(
    projectId: string,
    body: v.InferInput<typeof createAlertBodySchema>,
    config?: RequestConfig,
  ): Promise<{ success: true }> {
    try {
      const credentials = resolveRequestCredentials(config);
      const request = resolveApiRequest(config);
      const response = await fetch(
        `${request.baseUrl}/projects/${encodeURIComponent(projectId)}${ALERTS_PATH}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(credentials),
            ...request.extraHeaders,
          },
          body: JSON.stringify(body),
        },
      );

      if (response.status === 401) {
        await handle401(credentials);
      }

      if (response.status === 201) {
        return { success: true };
      }

      // Non-201 is treated as an error
      let code = 'UNKNOWN';
      let message = `Request failed with status ${response.status}`;

      try {
        const responseBody = await response.json();
        const parsed = v.safeParse(errorResponseSchema, responseBody);
        if (parsed.success) {
          code = parsed.output.error.code;
          message = parsed.output.error.message;
        }
      } catch {
        // keep defaults
      }

      throw new ApiError(response.status, code, message);
    } catch (error) {
      if (isNetworkError(error)) throwNetworkError();
      throw error;
    }
  },

  async getPresets(projectId: string, config?: RequestConfig) {
    try {
      const credentials = resolveRequestCredentials(config);
      const request = resolveApiRequest(config);
      const response = await fetch(
        `${request.baseUrl}/projects/${encodeURIComponent(projectId)}/preset`,
        {
          headers: { ...getAuthHeaders(credentials), ...request.extraHeaders },
          cache: 'no-store',
        },
      );
      return await handleResponse(response, presetsResponseSchema, credentials);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        console.warn(
          `Preset endpoint not found for project ${projectId} — legacy server may not support /preset`,
        );
        return { data: [] };
      }
      if (isNetworkError(error)) throwNetworkError();
      throw error;
    }
  },

  async getFields(projectId: string, config?: RequestConfig) {
    try {
      const credentials = resolveRequestCredentials(config);
      const request = resolveApiRequest(config);
      const response = await fetch(
        `${request.baseUrl}/projects/${encodeURIComponent(projectId)}/field`,
        {
          headers: { ...getAuthHeaders(credentials), ...request.extraHeaders },
          cache: 'no-store',
        },
      );
      return await handleResponse(response, fieldsResponseSchema, credentials);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        console.warn(
          `Field endpoint not found for project ${projectId} — legacy server may not support /field`,
        );
        return { data: [] };
      }
      if (isNetworkError(error)) throwNetworkError();
      throw error;
    }
  },

  async getIcon(
    projectId: string,
    docId: string,
    config?: RequestConfig,
  ): Promise<Blob> {
    try {
      const credentials = resolveRequestCredentials(config);
      const request = resolveApiRequest(config);
      const response = await fetch(
        `${request.baseUrl}/projects/${encodeURIComponent(projectId)}/icon/${encodeURIComponent(docId)}`,
        {
          headers: {
            ...getAuthHeaders(credentials),
            ...request.extraHeaders,
          },
        },
      );

      if (response.status === 401) {
        await handle401(credentials);
      }

      if (!response.ok) {
        let code = 'UNKNOWN';
        let message = `Request failed with status ${response.status}`;
        try {
          const body = await response.json();
          const parsed = v.safeParse(errorResponseSchema, body);
          if (parsed.success) {
            code = parsed.output.error.code;
            message = parsed.output.error.message;
          }
        } catch {
          /* keep defaults */
        }
        throw new ApiError(response.status, code, message);
      }

      return response.blob();
    } catch (error) {
      if (isNetworkError(error)) throwNetworkError();
      throw error;
    }
  },
} as const;

// ---------------------------------------------------------------------------
// Invite endpoints (first-party Pages Functions)
// ---------------------------------------------------------------------------

export class InviteApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'InviteApiError';
    this.code = code;
  }
}

async function parseInviteError(response: Response): Promise<InviteApiError> {
  try {
    const body = await response.json();
    const parsed = v.safeParse(errorResponseSchema, body);
    if (parsed.success) {
      return new InviteApiError(
        parsed.output.error.code,
        parsed.output.error.message,
      );
    }
  } catch {
    // fall through to generic error below
  }
  return new InviteApiError(
    'INVITE_REQUEST_FAILED',
    `Invite request failed with status ${response.status}`,
  );
}

export async function createEncryptedInvite(
  baseUrl: string,
  token: string,
  ttlHours?: number,
): Promise<{ code: string }> {
  const body: Record<string, unknown> = { url: baseUrl, token };
  if (ttlHours !== undefined) body.ttlHours = ttlHours;

  let response: Response;
  try {
    response = await fetch('/api/invites/encrypt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (isNetworkError(error)) throwNetworkError();
    throw error;
  }

  if (!response.ok) {
    throw await parseInviteError(response);
  }

  const json: unknown = await response.json();
  if (
    !json ||
    typeof json !== 'object' ||
    typeof (json as { code?: unknown }).code !== 'string'
  ) {
    throw new InviteApiError(
      'INVITE_REQUEST_FAILED',
      'Invite encrypt response was malformed',
    );
  }
  return { code: (json as { code: string }).code };
}

export async function redeemEncryptedInvite(
  code: string,
): Promise<{ baseUrl: string; token: string }> {
  let response: Response;
  try {
    response = await fetch('/api/invites/decrypt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ code }),
    });
  } catch (error) {
    if (isNetworkError(error)) throwNetworkError();
    throw error;
  }

  if (!response.ok) {
    throw await parseInviteError(response);
  }

  const json: unknown = await response.json();
  if (
    !json ||
    typeof json !== 'object' ||
    typeof (json as { url?: unknown }).url !== 'string' ||
    typeof (json as { token?: unknown }).token !== 'string'
  ) {
    throw new InviteApiError(
      'INVITE_REQUEST_FAILED',
      'Invite decrypt response was malformed',
    );
  }
  const { url, token } = json as { url: string; token: string };
  return { baseUrl: url, token };
}

// ---------------------------------------------------------------------------
// getAttachmentUrl (URL builder, no fetch)
// ---------------------------------------------------------------------------

export function getAttachmentUrl(
  projectId: string,
  driveId: string,
  type: string,
  name: string,
  variant?: string,
  options?: { baseUrl?: string },
): string {
  const baseUrl =
    options?.baseUrl ?? selectActiveBaseUrl(useAuthStore.getState());
  // Keep archive URLs intact here. AuthImg/useAuthenticatedImageUrl converts
  // matching archive URLs to /api proxy requests with the required headers.
  const base = baseUrl?.replace(/\/+$/, '') ?? '';
  const path = `${base}/projects/${encodeURIComponent(projectId)}/attachments/${encodeURIComponent(driveId)}/${encodeURIComponent(type)}/${encodeURIComponent(name)}`;
  return variant ? `${path}?variant=${encodeURIComponent(variant)}` : path;
}
