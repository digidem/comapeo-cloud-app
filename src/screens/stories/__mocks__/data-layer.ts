/**
 * Mock for data-layer functions used by screens.
 */
export async function syncRemoteArchive(
  _serverId: string,
  _config: { baseUrl: string; token: string },
): Promise<{ success: boolean }> {
  return { success: true };
}
