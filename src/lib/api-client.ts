import * as v from 'valibot';

import {
  alertsResponseSchema,
  createAlertBodySchema,
  errorResponseSchema,
  observationsResponseSchema,
  projectsResponseSchema,
  serverInfoResponseSchema,
} from '@/lib/schemas';
import { useAuthStore } from '@/stores/auth-store';

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBaseUrl(config?: RequestConfig): string {
  if (config?.baseUrl) return config.baseUrl;
  const { baseUrl } = useAuthStore.getState();
  if (baseUrl) return baseUrl;
  return window.location.origin;
}

function getAuthHeaders(config?: RequestConfig): Record<string, string> {
  if (config?.token) return { Authorization: `Bearer ${config.token}` };
  const { token } = useAuthStore.getState();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError && error.message === 'Failed to fetch';
}

function throwNetworkError(): never {
  throw new Error('Unable to connect');
}

async function handleResponse<T>(
  response: Response,
  schema: v.GenericSchema<T>,
  config?: RequestConfig,
): Promise<T> {
  if (response.status === 401 && !config) {
    useAuthStore.getState().clearAuth();
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
      const response = await fetch(`${getBaseUrl(config)}/info`);
      return handleResponse(response, serverInfoResponseSchema, config);
    } catch (error) {
      if (isNetworkError(error)) throwNetworkError();
      throw error;
    }
  },

  async healthCheck(config?: RequestConfig): Promise<boolean> {
    try {
      const response = await fetch(`${getBaseUrl(config)}/healthcheck`);
      return response.status === 200;
    } catch {
      return false;
    }
  },

  async getProjects(config?: RequestConfig) {
    try {
      const response = await fetch(`${getBaseUrl(config)}/projects`, {
        headers: { ...getAuthHeaders(config) },
      });
      return handleResponse(response, projectsResponseSchema, config);
    } catch (error) {
      if (isNetworkError(error)) throwNetworkError();
      throw error;
    }
  },

  async getObservations(projectId: string, config?: RequestConfig) {
    try {
      const response = await fetch(
        `${getBaseUrl(config)}/projects/${encodeURIComponent(projectId)}/observations`,
        { headers: { ...getAuthHeaders(config) } },
      );
      return handleResponse(response, observationsResponseSchema, config);
    } catch (error) {
      if (isNetworkError(error)) throwNetworkError();
      throw error;
    }
  },

  async getAlerts(projectId: string, config?: RequestConfig) {
    try {
      const response = await fetch(
        `${getBaseUrl(config)}/projects/${encodeURIComponent(projectId)}${ALERTS_PATH}`,
        { headers: { ...getAuthHeaders(config) } },
      );
      return handleResponse(response, alertsResponseSchema, config);
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
      const response = await fetch(
        `${getBaseUrl(config)}/projects/${encodeURIComponent(projectId)}${ALERTS_PATH}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(config),
          },
          body: JSON.stringify(body),
        },
      );

      if (response.status === 401 && !config) {
        useAuthStore.getState().clearAuth();
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
} as const;

// ---------------------------------------------------------------------------
// getAttachmentUrl (URL builder, no fetch)
// ---------------------------------------------------------------------------

export function getAttachmentUrl(
  projectId: string,
  driveId: string,
  type: string,
  name: string,
  variant?: string,
): string {
  const { baseUrl } = useAuthStore.getState();
  const base = baseUrl || window.location.origin;
  const path = `${base}/projects/${encodeURIComponent(projectId)}/attachments/${encodeURIComponent(driveId)}/${encodeURIComponent(type)}/${encodeURIComponent(name)}`;
  return variant ? `${path}/${variant}` : path;
}
