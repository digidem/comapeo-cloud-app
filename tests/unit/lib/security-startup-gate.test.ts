import { describe, expect, it } from 'vitest';

import {
  SECURITY_STARTUP_STATES,
  isSecurityStartupReady,
  readSecurityStartupState,
} from '@/lib/security-startup-gate';

function rootWith(value?: string): Pick<HTMLElement, 'dataset'> {
  return {
    dataset: value === undefined ? {} : { comapeoSecurityStartup: value },
  } as Pick<HTMLElement, 'dataset'>;
}

describe('security startup gate', () => {
  it('exports exactly the canonical non-secret startup states', () => {
    expect(SECURITY_STARTUP_STATES).toEqual([
      'ready',
      'storage-cleanup-required',
      'worker-transition-required',
    ]);
  });

  it.each([
    'ready',
    'storage-cleanup-required',
    'worker-transition-required',
  ] as const)('accepts exact marker %s', (state) => {
    expect(readSecurityStartupState(rootWith(state))).toBe(state);
  });

  it.each([undefined, '', 'READY', 'unknown', 'worker-transition'])(
    'fails closed for missing or malformed marker %s',
    (value) => {
      expect(readSecurityStartupState(rootWith(value))).toBe(
        'storage-cleanup-required',
      );
      expect(isSecurityStartupReady(rootWith(value))).toBe(false);
    },
  );

  it('enables credential-bearing behavior only for exact ready', () => {
    expect(isSecurityStartupReady(rootWith('ready'))).toBe(true);
    expect(isSecurityStartupReady(rootWith('worker-transition-required'))).toBe(
      false,
    );
  });
});
