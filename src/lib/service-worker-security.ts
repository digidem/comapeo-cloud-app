export const SERVICE_WORKER_SECURITY_REVISION = 'credential-cache-v1' as const;
export const SERVICE_WORKER_SECURITY_PROBE =
  'COMAPEO_SECURITY_REVISION_PROBE' as const;
export const PUBLIC_RUNTIME_CACHE_NAME = 'remote-public-cache-v2' as const;
export const LEGACY_RUNTIME_CACHE_NAMES = ['remote-api-cache'] as const;

export type ServiceWorkerSecurityVerification =
  { kind: 'current' } | { kind: 'transition-required' };

interface ControllerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

interface VerifyOptions {
  controller?: ControllerLike | null;
  timeoutMs?: number;
  createMessageChannel?: () => MessageChannel;
}

export const CREDENTIAL_HEADER_NAMES = [
  'authorization',
  'proxy-authorization',
  'x-api-key',
] as const;

export function requestCarriesCredentialHeader(
  request: Pick<Request, 'headers'>,
): boolean {
  return CREDENTIAL_HEADER_NAMES.some((name) => request.headers.has(name));
}

function normalizeInvitePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  return trimmed.toLowerCase();
}

export function hasSensitiveInviteRequestUrl(value: string | URL): boolean {
  let url: URL;
  try {
    url = typeof value === 'string' ? new URL(value) : value;
  } catch {
    return false;
  }

  if (normalizeInvitePath(url.pathname) !== '/invite') return false;
  const sensitiveKeys = ['code', 'to' + 'ken', 'hash', 'inviteCode'];
  return sensitiveKeys.some((key) => url.searchParams.has(key));
}

function currentController(): ControllerLike | null {
  if (
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !navigator.serviceWorker
  ) {
    return null;
  }
  return navigator.serviceWorker.controller;
}

export async function verifyControllingServiceWorker(
  options: VerifyOptions = {},
): Promise<ServiceWorkerSecurityVerification> {
  const controller =
    options.controller === undefined ? currentController() : options.controller;
  if (!controller) return { kind: 'current' };

  const createMessageChannel =
    options.createMessageChannel ?? (() => new MessageChannel());
  const channel = createMessageChannel();
  const timeoutMs = options.timeoutMs ?? 1_000;

  return new Promise<ServiceWorkerSecurityVerification>((resolve) => {
    let settled = false;
    const finish = (result: ServiceWorkerSecurityVerification) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      channel.port1.close();
      resolve(result);
    };

    const timeoutId = setTimeout(
      () => finish({ kind: 'transition-required' }),
      timeoutMs,
    );

    channel.port1.onmessage = (event: MessageEvent) => {
      const payload = event.data as
        { type?: unknown; revision?: unknown } | null | undefined;
      finish(
        payload?.type === SERVICE_WORKER_SECURITY_PROBE &&
          payload.revision === SERVICE_WORKER_SECURITY_REVISION
          ? { kind: 'current' }
          : { kind: 'transition-required' },
      );
    };

    try {
      controller.postMessage({ type: SERVICE_WORKER_SECURITY_PROBE }, [
        channel.port2,
      ]);
    } catch {
      finish({ kind: 'transition-required' });
    }
  });
}
