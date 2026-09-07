#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

PLAYWRIGHT_VERSION="$(node -p "require('./node_modules/@playwright/test/package.json').version")"
PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required so WebKit runs with the same Playwright system dependencies as CI." >&2
  exit 1
fi

echo "==> QA #359: focused unit and CI guardrail coverage"
npx vitest run \
  tests/unit/screens/Home/ReportBrandingDialog.test.tsx \
  tests/unit/guardrails.test.ts

echo "==> QA #359: type, lint, format, and production build"
npm run lint:types
npx eslint tests/e2e/report-branding.e2e.ts tests/unit/guardrails.test.ts
npx prettier --check \
  .github/workflows/ci.yml \
  tests/e2e/report-branding.e2e.ts \
  tests/unit/guardrails.test.ts
npm run build:ci

echo "==> QA #359: Chromium + Firefox report-branding paths, retries disabled"
docker run --rm --ipc=host \
  --user "$(id -u):$(id -g)" \
  -e VITE_PREVIEW=1 \
  -v "$ROOT_DIR:/work" \
  -w /work \
  "$PLAYWRIGHT_IMAGE" \
  npx playwright test tests/e2e/report-branding.e2e.ts \
    --project=chromium \
    --project=firefox \
    --retries=0 \
    --workers=1 \
    --reporter=list \
    --output=/tmp/comapeo-qa-359-chromium-firefox

echo "==> QA #359: representative WebKit PR ordering, retries disabled"
docker run --rm --ipc=host \
  --user "$(id -u):$(id -g)" \
  -e VITE_PREVIEW=1 \
  -v "$ROOT_DIR:/work" \
  -w /work \
  "$PLAYWRIGHT_IMAGE" \
  npx playwright test \
    tests/e2e/app-db.e2e.ts \
    tests/e2e/report-branding.e2e.ts \
    --project=webkit \
    --retries=0 \
    --workers=1 \
    --reporter=list \
    --output=/tmp/comapeo-qa-359-webkit

echo
printf '%s\n' "QA #359 automated checks passed. Confirm exact-SHA GitHub build-e2e is green before merge readiness."
