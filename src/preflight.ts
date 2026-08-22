type StartupState =
  'ready' | 'storage-cleanup-required' | 'worker-transition-required';

type CleanupResult = { kind: 'ok' } | { kind: 'failed'; code: string };

type WorkerVerification = { kind: 'current' } | { kind: 'transition-required' };

interface PreflightLocation {
  href: string;
  pathname: string;
  search: string;
  hash: string;
  replace(url: string): void;
}

interface PreflightHistory {
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

interface PreflightRoot {
  dataset: DOMStringMap;
}

interface PreflightDependencies {
  location: PreflightLocation;
  history: PreflightHistory;
  root: PreflightRoot;
  importCleanup: () => Promise<{
    cleanupLegacyCredentialStorage: () => Promise<CleanupResult>;
  }>;
  importWorkerSecurity: () => Promise<{
    verifyControllingServiceWorker: () => Promise<WorkerVerification>;
  }>;
  importBootstrap: () => Promise<{
    storeInviteBootstrapCandidate: (value: string) => { expiresAt: number };
    clearInviteBootstrapCandidate: () => void;
  }>;
  importMain: () => Promise<unknown>;
  addPagehideListener: (handler: () => void) => void;
  mark: (name: string) => void;
}

const READY: StartupState = 'ready';
const STORAGE_CLEANUP_REQUIRED: StartupState = 'storage-cleanup-required';
const WORKER_TRANSITION_REQUIRED: StartupState = 'worker-transition-required';
const DATASET_KEY = 'comapeoSecurityStartup';

function normalizeInvitePath(pathname: string): string {
  const withoutTrailingSlash = pathname.replace(/\/+$/, '') || '/';
  return withoutTrailingSlash.toLowerCase();
}

function isInvitePath(pathname: string): boolean {
  return normalizeInvitePath(pathname) === '/invite';
}

function publishState(root: PreflightRoot, state: StartupState): void {
  root.dataset[DATASET_KEY] = state;
}

function defaultDependencies(): PreflightDependencies {
  return {
    location: window.location,
    history: window.history,
    root: document.documentElement,
    importCleanup: () => import('./lib/legacy-credential-cleanup'),
    importWorkerSecurity: () => import('./lib/service-worker-security'),
    importBootstrap: () => import('./lib/invite-bootstrap-runtime'),
    importMain: () => import('./main'),
    addPagehideListener: (handler) => {
      window.addEventListener('pagehide', handler, { once: true });
    },
    mark: (name) => {
      if (typeof performance !== 'undefined' && performance.mark) {
        performance.mark(name);
      }
    },
  };
}

async function importLocalShell(
  dependencies: PreflightDependencies,
): Promise<void> {
  try {
    await dependencies.importMain();
  } catch {
    // The normal application entry owns its own visible bootstrap failure UI.
    // Never log startup URLs or dynamically recovered details from here.
  }
}

export async function runSecurityPreflight(
  dependencies: PreflightDependencies = defaultDependencies(),
): Promise<void> {
  dependencies.mark('comapeo-security-preflight-start');

  let inviteCandidate: string | undefined;
  const discardInviteCandidate = () => {
    inviteCandidate = undefined;
  };
  const sensitiveInviteNavigation =
    isInvitePath(dependencies.location.pathname) &&
    (dependencies.location.search !== '' || dependencies.location.hash !== '');

  if (sensitiveInviteNavigation) {
    inviteCandidate = dependencies.location.href;
    try {
      dependencies.history.replaceState(null, '', '/invite');
    } catch {
      discardInviteCandidate();
      dependencies.location.replace('/invite');
      return;
    }
  }

  let cleanupModule:
    Awaited<ReturnType<PreflightDependencies['importCleanup']>> | undefined;
  try {
    cleanupModule = await dependencies.importCleanup();
  } catch {
    discardInviteCandidate();
    publishState(dependencies.root, STORAGE_CLEANUP_REQUIRED);
    dependencies.mark('comapeo-security-preflight-blocked-storage');
    await importLocalShell(dependencies);
    return;
  }

  let cleanupResult: CleanupResult;
  try {
    cleanupResult = await cleanupModule.cleanupLegacyCredentialStorage();
  } catch {
    cleanupResult = {
      kind: 'failed',
      code: 'LEGACY_STORAGE_CLEANUP_FAILED',
    };
  }

  if (cleanupResult.kind !== 'ok') {
    discardInviteCandidate();
    publishState(dependencies.root, STORAGE_CLEANUP_REQUIRED);
    dependencies.mark('comapeo-security-preflight-blocked-storage');
    await importLocalShell(dependencies);
    return;
  }

  let workerVerification: WorkerVerification;
  try {
    const workerModule = await dependencies.importWorkerSecurity();
    workerVerification = await workerModule.verifyControllingServiceWorker();
  } catch {
    workerVerification = { kind: 'transition-required' };
  }

  if (workerVerification.kind !== 'current') {
    discardInviteCandidate();
    publishState(dependencies.root, WORKER_TRANSITION_REQUIRED);
    dependencies.mark('comapeo-security-preflight-blocked-worker');
    await importLocalShell(dependencies);
    return;
  }

  publishState(dependencies.root, READY);
  dependencies.mark('comapeo-security-preflight-ready');

  if (inviteCandidate === undefined) {
    await importLocalShell(dependencies);
    return;
  }

  let bootstrapModule:
    Awaited<ReturnType<PreflightDependencies['importBootstrap']>> | undefined;
  try {
    bootstrapModule = await dependencies.importBootstrap();
  } catch {
    discardInviteCandidate();
    return;
  }

  bootstrapModule.storeInviteBootstrapCandidate(inviteCandidate);
  discardInviteCandidate();
  dependencies.addPagehideListener(() => {
    bootstrapModule?.clearInviteBootstrapCandidate();
  });

  try {
    await dependencies.importMain();
  } catch {
    bootstrapModule.clearInviteBootstrapCandidate();
  }
}

if (!import.meta.env.VITEST) {
  void runSecurityPreflight();
}
