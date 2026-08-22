import type { RemoteServer } from '@/lib/db';
import {
  createRemoteServer,
  updateRemoteServer,
} from '@/lib/local-repositories';

const persistedServer: RemoteServer = {
  id: 'server-id',
  baseUrl: 'https://archive.example.com',
  status: 'idle',
  lastSyncedAt: '',
};

// @ts-expect-error Persisted RemoteServer rows must never expose a credential field.
persistedServer.token = '[REDACTED_SECRET]';

async function assertCredentialFreeRepositoryInputs() {
  await createRemoteServer({
    baseUrl: 'https://archive.example.com',
    // @ts-expect-error Remote-server create inputs must reject credential fields.
    token: '[REDACTED_SECRET]',
  });

  // @ts-expect-error Remote-server update inputs must reject credential fields.
  await updateRemoteServer('server-id', { token: '[REDACTED_SECRET]' });
}

void assertCredentialFreeRepositoryInputs;
