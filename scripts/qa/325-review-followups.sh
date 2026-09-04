#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "==> QA #325: documented storage-reset control-plane exception"
grep -Fq 'comapeo:credentialCleanupVersion' AGENTS.md

echo "==> QA #325: static contracts"
npm run lint:types
npm run lint:eslint
npm run lint:prettier

echo "==> QA #325: telemetry, Sentry, credential and authenticated-media regressions"
npm test -- \
  tests/unit/lib/telemetry-redaction.test.ts \
  tests/unit/lib/sentry.test.ts \
  tests/unit/lib/service-worker-security.test.ts \
  tests/unit/lib/legacy-credential-cleanup.test.ts \
  tests/unit/hooks/useAuthenticatedImageUrl.test.tsx \
  tests/unit/components/shared/auth-img.test.tsx \
  tests/unit/components/shared/audio-player.test.tsx

echo "==> QA #325: production-style build and security verifier"
npm run build:ci

echo
printf '%s\n' "QA #325 automated checks passed. Continue with docs/qa/325.md for preview/staging acceptance."
