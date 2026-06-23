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

export async function createEncryptedInvite(
  _url: string,
  _token: string,
): Promise<{ code: string }> {
  return { code: 'v1.mock-invite-code-for-storybook-testing' };
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
