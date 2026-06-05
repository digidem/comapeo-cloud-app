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
    expect(packageJson.packageManager).toMatch(/^bun@\d+\.\d+\.\d+$/);
    expect(packageJson.scripts?.['check:i18n']).toBe(
      'npm run extract-messages && git diff --exit-code -- src/i18n/messages/en.json',
    );
    expect(packageJson.scripts?.['verify:handoff']).toBe(
      'npm run lint && npm run test:coverage && npm run build',
    );
    expect(packageJson.scripts?.['validate']).toBe('bash scripts/validate.sh');
    expect(packageJson.scripts?.['validate:fast']).toBe(
      'bash scripts/validate-fast.sh',
    );
  });

  it('keeps local git hooks aligned with required guardrails', () => {
    const preCommitHook = readRepoFile('.husky/pre-commit');
    const prePushHook = readRepoFile('.husky/pre-push');

    expect(preCommitHook).toContain('trufflehog');
    expect(preCommitHook).toContain('lint-staged');
    expect(prePushHook).toContain('npm run validate');
    expect(prePushHook).toContain('case "$BRANCH" in');
    // sh defaults to continue-on-error and reports only the last command's
    // exit code, so without `set -e` an earlier failure would silently pass.
    expect(preCommitHook).toMatch(/^set -e$/m);
    expect(prePushHook).toMatch(/^set -e[ua]*$/m);
  });

  it('hardens CI with scoped permissions, deterministic setup, and blocking checks', () => {
    const ci = readRepoFile('.github/workflows/ci.yml');

    // Permissions are scoped (not write-all)
    expect(ci).toContain('permissions:');
    expect(ci).toContain('contents: read');
    // Concurrency cancels in-progress duplicate runs
    expect(ci).toContain('concurrency:');
    expect(ci).toContain('cancel-in-progress: true');
    // Jobs have timeout limits
    expect(ci).toMatch(/check:\n(?:[\s\S]*?)timeout-minutes: 15/);
    expect(ci).toMatch(/deploy:\n(?:[\s\S]*?)timeout-minutes: 5/);
    expect(ci).toMatch(/lighthouse:\n(?:[\s\S]*?)timeout-minutes: 5/);
    // Node setup follows the checked-in runtime pin
    expect(ci).toContain('node-version-file: .node-version');
    // Deterministic installs via bun lockfile
    expect(ci).toContain('bun install --frozen-lockfile');
    // i18n check blocks CI
    expect(ci).toContain('run: npm run check:i18n');
    // Screenshots job should not silently pass on failure
    // (the separate screenshots job uses continue-on-error, which is
    // acceptable because it's not on the critical path)
  });

  it('keeps coverage configuration explicit about exclusions', () => {
    const mainSource = readRepoFile('src/main.tsx');
    const vitestConfig = readRepoFile('vitest.config.ts');

    // Coverage includes src files
    expect(vitestConfig).toContain("include: ['src/**/*.{ts,tsx}']");
    // Hard-to-test files are explicitly excluded (not silently dropped)
    expect(vitestConfig).toContain("'src/main.tsx'");
    // Storybook files are visual fixtures, not runtime coverage targets
    expect(vitestConfig).toContain("'src/**/*.stories.{ts,tsx}'");
    expect(vitestConfig).toContain("'src/screens/stories/**'");
    // main.tsx avoids non-null assertions and JSX syntax
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
