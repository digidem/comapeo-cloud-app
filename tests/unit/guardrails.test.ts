import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = process.cwd();

function readRepoFile(filePath: string) {
  return readFileSync(path.join(rootDir, filePath), 'utf8');
}

describe('repository guardrails', () => {
  it('pins and enforces the Node/npm toolchain', () => {
    const packageJson = JSON.parse(readRepoFile('package.json')) as {
      engines?: { node?: string };
      packageManager?: string;
      scripts?: Record<string, string>;
    };

    expect(readRepoFile('.node-version').trim()).toBe('22');
    expect(readRepoFile('.npmrc')).toContain('engine-strict=true');
    expect(packageJson.engines?.node).toBe('>=22.0.0');
    expect(packageJson.packageManager).toMatch(/^npm@\d+\.\d+\.\d+$/);
    expect(packageJson.scripts?.['check:i18n']).toBe(
      'npm run extract-messages && git diff --exit-code -- src/i18n/messages/en.json',
    );
    expect(packageJson.scripts?.['verify:handoff']).toBe(
      'npm run lint && npm run test:coverage && npm run build',
    );
  });

  it('keeps local git hooks aligned with required guardrails', () => {
    const preCommitHook = readRepoFile('.husky/pre-commit');
    const prePushHook = readRepoFile('.husky/pre-push');

    expect(preCommitHook).toContain('gitleaks protect --staged');
    expect(preCommitHook).toContain('lint-staged');
    expect(prePushHook).toContain('npm run verify:handoff');
    expect(prePushHook).toContain('npm run check:i18n');
  });

  it('hardens CI with scoped permissions, deterministic setup, and blocking checks', () => {
    const ci = readRepoFile('.github/workflows/ci.yml');

    expect(ci).toMatch(/^permissions:\n[ ]{2}contents: read/m);
    expect(ci).toContain('concurrency:');
    expect(ci).toContain('cancel-in-progress: true');
    expect(ci).toMatch(/check:\n(?:[\s\S]*?)timeout-minutes: 60/);
    expect(ci).toMatch(/deploy:\n(?:[\s\S]*?)timeout-minutes: 30/);
    expect(ci).toMatch(/lighthouse:\n(?:[\s\S]*?)timeout-minutes: 30/);
    expect(ci).toMatch(/node-version-file: \.node-version/);
    expect(ci).toMatch(/cache-dependency-path: package-lock\.json/);
    expect(ci).toContain('run: npm run check:i18n');
    expect(ci).not.toContain('continue-on-error: true');
  });

  it('keeps coverage from silently dropping the application entrypoint', () => {
    const mainSource = readRepoFile('src/main.tsx');
    const vitestConfig = readRepoFile('vitest.config.ts');

    expect(vitestConfig).toContain("include: ['src/**/*.{ts,tsx}']");
    expect(vitestConfig).not.toContain("'src/main.tsx'");
    expect(mainSource).not.toContain("document.getElementById('root')!");
    expect(mainSource).not.toContain('<StrictMode>');
    expect(mainSource).toContain('createElement(StrictMode');
  });

  it('keeps required guardrail files present', () => {
    expect(existsSync(path.join(rootDir, '.gitleaks.toml'))).toBe(true);
    expect(existsSync(path.join(rootDir, 'lint-staged.config.mjs'))).toBe(true);
    expect(existsSync(path.join(rootDir, '.github/workflows/ci.yml'))).toBe(
      true,
    );
  });
});
