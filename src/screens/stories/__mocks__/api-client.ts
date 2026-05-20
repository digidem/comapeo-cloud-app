/**
 * Mock for API client functions used by screens.
 */
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
