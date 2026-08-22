import { normalizeArchiveBaseUrl } from '@/lib/archive-proxy';
import {
  type SecurityStartupState,
  readSecurityStartupState,
} from '@/lib/security-startup-gate';

export type ArchiveTransportDecision =
  { kind: 'approved'; normalizedUrl: string } | { kind: 'cancelled' };

type ArchiveUrlError = Exclude<
  ReturnType<typeof normalizeArchiveBaseUrl>,
  { ok: true }
>;

export type ArchiveTransportResult<T> =
  | { kind: 'completed'; value: T }
  | {
      kind: 'invalid-url';
      code: ArchiveUrlError['code'];
      message: string;
    }
  | { kind: 'cancelled' }
  | { kind: 'stale-approval' }
  | {
      kind: 'startup-blocked';
      state: Exclude<SecurityStartupState, 'ready'>;
    };

interface ArchiveTransportOptions<T> {
  baseUrl: string;
  confirmInsecure: (normalizedUrl: string) => Promise<ArchiveTransportDecision>;
  operation: (normalizedUrl: string) => Promise<T> | T;
}

export async function withApprovedArchiveTransport<T>({
  baseUrl,
  confirmInsecure,
  operation,
}: ArchiveTransportOptions<T>): Promise<ArchiveTransportResult<T>> {
  const startupState = readSecurityStartupState();
  if (startupState !== 'ready') {
    return { kind: 'startup-blocked', state: startupState };
  }

  const normalized = normalizeArchiveBaseUrl(baseUrl);
  if (!normalized.ok) {
    return {
      kind: 'invalid-url',
      code: normalized.code,
      message: normalized.message,
    };
  }

  const normalizedUrl = normalized.value;
  const protocol = new URL(normalizedUrl).protocol;
  if (protocol === 'https:') {
    return { kind: 'completed', value: await operation(normalizedUrl) };
  }

  const decision = await confirmInsecure(normalizedUrl);
  if (decision.kind !== 'approved') return { kind: 'cancelled' };
  if (decision.normalizedUrl !== normalizedUrl) {
    return { kind: 'stale-approval' };
  }

  return { kind: 'completed', value: await operation(normalizedUrl) };
}
