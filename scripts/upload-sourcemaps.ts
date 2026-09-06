/**
 * Upload source maps to Sentry after build.
 *
 * Requires: SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN env vars.
 * When any are missing, logs a message and exits 0 (preview deploys)
 * or exits 1 (production deploys when VITE_SENTRY_DSN is set).
 *
 * Usage:  npx tsx scripts/upload-sourcemaps.ts [--production]
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { buildSentryCliSteps, executeSentryCliSteps } from './lib/sentry-cli';

const isProduction = process.argv.includes('--production');
const rootDir = resolve(import.meta.dirname ?? '.', '..');
const distDir = resolve(rootDir, 'dist');

const SENTRY_ORG = process.env.SENTRY_ORG;
const SENTRY_PROJECT = process.env.SENTRY_PROJECT;
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
const SENTRY_DSN = process.env.VITE_SENTRY_DSN;
const RELEASE = process.env.VITE_APP_RELEASE ?? 'unknown';

if (!SENTRY_ORG || !SENTRY_PROJECT || !SENTRY_AUTH_TOKEN) {
  if (isProduction && SENTRY_DSN) {
    console.error(
      '[upload-sourcemaps] ERROR: Production build has VITE_SENTRY_DSN set but is missing Sentry secrets (SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN).',
    );
    process.exit(1);
  }
  console.log(
    '[upload-sourcemaps] Skipping Sentry upload — missing SENTRY_ORG, SENTRY_PROJECT, or SENTRY_AUTH_TOKEN.',
  );
  process.exit(0);
}

if (!SENTRY_DSN) {
  console.log(
    '[upload-sourcemaps] Skipping Sentry upload — VITE_SENTRY_DSN is not set.',
  );
  process.exit(0);
}

console.log(
  `[upload-sourcemaps] Uploading source maps for release: ${RELEASE}`,
);

const result = executeSentryCliSteps(
  buildSentryCliSteps({
    org: SENTRY_ORG,
    project: SENTRY_PROJECT,
    release: RELEASE,
    distDir,
  }),
  (args) => {
    execFileSync('npx', [...args], {
      stdio: 'inherit',
      env: {
        ...process.env,
        SENTRY_AUTH_TOKEN,
      },
    });
  },
);

if (result.exitCode !== 0) {
  process.exit(result.exitCode);
}

console.log('[upload-sourcemaps] Upload complete.');
