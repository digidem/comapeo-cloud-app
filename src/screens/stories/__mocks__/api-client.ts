/**
 * Mock for API client functions used by screens.
 */
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

export const apiClient = {
  async getProjects(_config?: unknown) {
    return { data: [] };
  },
};

export class InviteApiError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

const LONG_MOCK_INVITE_CODE =
  'v1.mock-encrypted-invite-code-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789-abcdefghijklmnopqrstuvwxyz0123456789-abcdefghijklmnopqrstuvwxyz0123456789-abcdefghijklmnopqrstuvwxyz0123456789';

export async function createEncryptedInvite(
  _url: string,
  _token: string,
): Promise<{ code: string }> {
  return {
    code: LONG_MOCK_INVITE_CODE,
  };
}

export async function redeemEncryptedInvite(
  _code: string,
): Promise<{ baseUrl: string; token: string }> {
  return {
    baseUrl: 'https://archive.example.com',
    token: 'mock-token',
  };
}

export function getAttachmentUrl(
  _projectId: string,
  _driveId: string,
  _type: string,
  _name: string,
  _variant?: string,
  _options?: { baseUrl?: string },
): string {
  return '/mock-attachment.mp3';
}
