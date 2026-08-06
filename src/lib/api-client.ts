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

export type EndpointReconciliationMode =
  'snapshot' | 'delta' | 'tombstone-stream' | 'unknown';
export type EndpointAvailability = 'supported' | 'unsupported';
export type EndpointSemanticsSource = 'contract' | 'header' | 'route-404';

export interface EndpointSemantics {
  resource:
    'projects' | 'observations' | 'alerts' | 'presets' | 'tracks' | 'fields';
  availability: EndpointAvailability;
  mode: EndpointReconciliationMode;
  source: EndpointSemanticsSource;
  apiVersion?: string;
}

interface EndpointContract {
  resource: EndpointSemantics['resource'];
  mode: EndpointReconciliationMode;
}

const ENDPOINT_CONTRACTS = {
  // Project visibility is token-scoped. An empty 200 can therefore mean that
  // the token lost access rather than that every previously visible project
  // was deleted. Require an explicit snapshot header before reconciling
  // project omissions destructively.
  projects: { resource: 'projects', mode: 'unknown' },
  observations: { resource: 'observations', mode: 'snapshot' },
  alerts: { resource: 'alerts', mode: 'snapshot' },
  presets: { resource: 'presets', mode: 'snapshot' },
  tracks: { resource: 'tracks', mode: 'snapshot' },
  fields: { resource: 'fields', mode: 'snapshot' },
} as const satisfies Record<string, EndpointContract>;

// ---------------------------------------------------------------------------
// RequestConfig — explicit credentials for remote archive calls
// ---------------------------------------------------------------------------

export interface RequestConfig {
  baseUrl: string;
  token: string;
  signal?: AbortSignal;
}

type RequestCredentials = AuthIdentity;

// ---------------------------------------------------------------------------
// Resolve credentials

// ---------------------------------------------------------------------------
// ApiError
// ---------------------------------------------------------------------------

export type ApiErrorKind = 'http' | 'unsupported-endpoint' | 'missing-project';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly kind: ApiErrorKind;

  constructor(
    status: number,
    code: string,
    message: string,
    kind: ApiErrorKind = 'http',
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.kind = kind;
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
 *
 * Cleanup failures (e.g. IndexedDB errors) are logged and swallowed so the
 * caller still surfaces the original ApiError(401) rather than a storage error.
 */
async function handle401(
  requestCredentials: RequestCredentials,
): Promise<void> {
  try {
    await useAuthStore.getState().clearAuth(requestCredentials);
  } catch (error) {
    console.error('Failed to clear credentials after 401 response:', error);
  }
}

function attachEndpointSemantics<T extends object>(
  value: T,
  semantics: EndpointSemantics,
): T & { semantics: EndpointSemantics } {
  Object.defineProperty(value, 'semantics', {
    value: semantics,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return value as T & { semantics: EndpointSemantics };
}

function semanticsForResponse(
  response: Response,
  contract: EndpointContract,
): EndpointSemantics {
  const declaredMode = response.headers.get('x-comapeo-reconciliation-mode');
  const mode = (
    declaredMode === 'snapshot' ||
    declaredMode === 'delta' ||
    declaredMode === 'tombstone-stream'
      ? declaredMode
      : contract.mode
  ) as EndpointReconciliationMode;
  const apiVersion = response.headers.get('x-comapeo-api-version') ?? undefined;

  return {
    resource: contract.resource,
    availability: 'supported',
    mode,
    source: declaredMode ? 'header' : 'contract',
    ...(apiVersion ? { apiVersion } : {}),
  };
}

function unsupportedSemantics(contract: EndpointContract): EndpointSemantics {
  return {
    resource: contract.resource,
    availability: 'unsupported',
    mode: 'unknown',
    source: 'route-404',
  };
}

function classify404(
  body: unknown,
  code: string,
  message: string,
): ApiErrorKind {
  const topLevelMessage =
    body && typeof body === 'object' && 'message' in body
      ? String(body.message)
      : '';
  if (/^Route\s+.+\s+not found$/i.test(topLevelMessage)) {
    return 'unsupported-endpoint';
  }
  if (
    /project\s+not found|missing project/i.test(message) ||
    /PROJECT_NOT_FOUND/i.test(code)
  ) {
    return 'missing-project';
  }
  // Default for 404: treat as unsupported endpoint so legacy servers that
  // return a bare 404 (no JSON body, no "Route not found" message) still
  // degrade gracefully instead of surfacing a hard error that blocks sync.
  return 'unsupported-endpoint';
}

async function handleResponse<T extends object>(
  response: Response,
  schema: v.GenericSchema<T>,
  requestCredentials: RequestCredentials,
  contract?: EndpointContract,
): Promise<T & { semantics?: EndpointSemantics }> {
  if (response.status === 401) {
    await handle401(requestCredentials);
  }

  if (!response.ok) {
    let code = 'UNKNOWN';
    let message = `Request failed with status ${response.status}`;
    let body: unknown;

    try {
      body = await response.json();
      const parsed = v.safeParse(errorResponseSchema, body);
      if (parsed.success) {
        code = parsed.output.error.code;
        message = parsed.output.error.message;
      } else if (body && typeof body === 'object' && 'message' in body) {
        message = String(body.message);
      }
    } catch {
      // Response body is not JSON or unparseable — keep defaults
    }

    throw new ApiError(
      response.status,
      code,
      message,
      response.status === 404 ? classify404(body, code, message) : 'http',
    );
  }

  const body: unknown = await response.json();
  const parsed = v.parse(schema, body);
  return contract
    ? attachEndpointSemantics(parsed, semanticsForResponse(response, contract))
    : (parsed as T & { semantics: EndpointSemantics });
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
        signal: config?.signal,
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
        signal: config?.signal,
      });
      return response.status === 200;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
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
        signal: config?.signal,
      });
      return handleResponse(
        response,
        projectsResponseSchema,
        credentials,
        ENDPOINT_CONTRACTS.projects,
      );
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
          signal: config?.signal,
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
          signal: config?.signal,
        },
      );
      return handleResponse(
        response,
        observationsResponseSchema,
        credentials,
        ENDPOINT_CONTRACTS.observations,
      );
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
          signal: config?.signal,
        },
      );
      return await handleResponse(
        response,
        tracksResponseSchema,
        credentials,
        ENDPOINT_CONTRACTS.tracks,
      );
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'unsupported-endpoint') {
        return attachEndpointSemantics(
          { data: [] },
          unsupportedSemantics(ENDPOINT_CONTRACTS.tracks),
        );
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
          signal: config?.signal,
        },
      );
      return handleResponse(
        response,
        alertsResponseSchema,
        credentials,
        ENDPOINT_CONTRACTS.alerts,
      );
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
          signal: config?.signal,
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
          signal: config?.signal,
        },
      );
      return await handleResponse(
        response,
        presetsResponseSchema,
        credentials,
        ENDPOINT_CONTRACTS.presets,
      );
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'unsupported-endpoint') {
        return attachEndpointSemantics(
          { data: [] },
          unsupportedSemantics(ENDPOINT_CONTRACTS.presets),
        );
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
          signal: config?.signal,
        },
      );
      return await handleResponse(
        response,
        fieldsResponseSchema,
        credentials,
        ENDPOINT_CONTRACTS.fields,
      );
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'unsupported-endpoint') {
        return attachEndpointSemantics(
          { data: [] },
          unsupportedSemantics(ENDPOINT_CONTRACTS.fields),
        );
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
          headers: { ...getAuthHeaders(credentials), ...request.extraHeaders },
          signal: config?.signal,
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
