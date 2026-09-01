export const SECURITY_STARTUP_STATES = [
  'ready',
  'storage-cleanup-required',
  'worker-transition-required',
] as const;

export type SecurityStartupState = (typeof SECURITY_STARTUP_STATES)[number];

export const SECURITY_STARTUP_DATASET_KEY = 'comapeoSecurityStartup' as const;

export function readSecurityStartupState(
  root: Pick<HTMLElement, 'dataset'> = document.documentElement,
): SecurityStartupState {
  const value = root.dataset[SECURITY_STARTUP_DATASET_KEY];
  return value === 'ready' ||
    value === 'storage-cleanup-required' ||
    value === 'worker-transition-required'
    ? value
    : 'storage-cleanup-required';
}

export class SecurityStartupBlockedError extends Error {
  readonly code = 'security-startup-blocked' as const;
  readonly state: Exclude<SecurityStartupState, 'ready'>;

  constructor(state: Exclude<SecurityStartupState, 'ready'>) {
    super(
      state === 'worker-transition-required'
        ? 'Security update required'
        : 'Secure storage cleanup required',
    );
    this.name = 'SecurityStartupBlockedError';
    this.state = state;
  }
}

export function isSecurityStartupReady(
  root?: Pick<HTMLElement, 'dataset'>,
): boolean {
  return readSecurityStartupState(root) === 'ready';
}

export function requireSecurityStartupReady(
  root?: Pick<HTMLElement, 'dataset'>,
): void {
  const state = readSecurityStartupState(root);
  if (state !== 'ready') throw new SecurityStartupBlockedError(state);
}
