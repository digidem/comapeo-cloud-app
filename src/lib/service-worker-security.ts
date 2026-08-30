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

async function probeController(
  controller: ControllerLike,
  timeoutMs: number,
  createMessageChannel: () => MessageChannel,
): Promise<ServiceWorkerSecurityVerification> {
  const channel = createMessageChannel();

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

export async function verifyControllingServiceWorker(
  options: VerifyOptions = {},
): Promise<ServiceWorkerSecurityVerification> {
  const usesLiveController = options.controller === undefined;
  const controller = usesLiveController
    ? currentController()
    : options.controller;
  if (!controller) return { kind: 'current' };

  const createMessageChannel =
    options.createMessageChannel ?? (() => new MessageChannel());
  const timeoutMs = options.timeoutMs ?? 1_000;
  const firstResult = await probeController(
    controller,
    timeoutMs,
    createMessageChannel,
  );
  if (firstResult.kind === 'current' || !usesLiveController) {
    return firstResult;
  }

  // A secure worker can claim the page while an old controller probe is in
  // flight. Re-read the live controller before publishing a blocked state so
  // preflight cannot miss a completed controllerchange and remain blocked until
  // a manual reload. Bound this to one replacement probe.
  const replacementController = currentController();
  if (!replacementController || replacementController === controller) {
    return firstResult;
  }
  return probeController(
    replacementController,
    timeoutMs,
    createMessageChannel,
  );
}
