import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function staticImportLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .filter((line) => /^\s*import(?:\s|\{)/.test(line));
}

describe('startup source contracts', () => {
  it('enters the app through preflight rather than main', () => {
    const html = source('index.html');
    expect(html).toContain('src="/src/preflight.ts"');
    expect(html).not.toContain('src="/src/main.tsx"');
  });

  it.each([
    'src/preflight.ts',
    'src/lib/invite-bootstrap-runtime.ts',
    'src/lib/legacy-credential-cleanup.ts',
  ])('%s has zero static imports', (path) => {
    expect(staticImportLines(source(path))).toEqual([]);
  });

  it('keeps preflight producer literals aligned with the application gate', () => {
    const preflight = source('src/preflight.ts');
    const gate = source('src/lib/security-startup-gate.ts');
    const states = [
      'ready',
      'storage-cleanup-required',
      'worker-transition-required',
    ];

    for (const state of states) {
      expect(preflight).toContain(`'${state}'`);
      expect(gate).toContain(`'${state}'`);
    }
    expect(states).toHaveLength(3);
  });

  it('rechecks the live worker after installing the transition listener', () => {
    const main = source('src/main.tsx');
    const transitionStart = main.indexOf(
      'function prepareSecureWorkerTransition',
    );
    const listenerIndex = main.indexOf("'controllerchange'", transitionStart);
    const verifyIndex = main.indexOf(
      'verifyControllingServiceWorker()',
      listenerIndex,
    );

    expect(transitionStart).toBeGreaterThanOrEqual(0);
    expect(listenerIndex).toBeGreaterThan(transitionStart);
    expect(verifyIndex).toBeGreaterThan(listenerIndex);
  });

  it('disables independent PWA registration injection', () => {
    expect(source('vite.config.ts')).toMatch(/injectRegister:\s*null/);
  });

  it('keeps the invite bootstrap handoff private instead of installing credential globals', () => {
    const preflight = source('src/preflight.ts');
    const bootstrap = source('src/lib/invite-bootstrap-runtime.ts');

    expect(preflight).not.toMatch(/globalThis\s*\[/);
    expect(preflight).not.toMatch(/window\s*\[[^\]]*(invite|token|code)/i);
    expect(bootstrap).not.toMatch(/globalThis\s*\[/);
    expect(bootstrap).not.toMatch(/window\s*\[/);
  });
});
