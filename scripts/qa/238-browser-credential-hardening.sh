#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

BUN_BIN="${BUN_INSTALL:-$HOME/.bun}/bin"
if [[ -d "$BUN_BIN" ]]; then
  export PATH="$BUN_BIN:$PATH"
fi

LEGACY_SHA="5f5e0685cf88866773e5ed661964debf48013d14"
LEGACY_PARENT="$(mktemp -d "${TMPDIR:-/tmp}/comapeo-qa-238.XXXXXX")"
LEGACY_DIR="$LEGACY_PARENT/legacy-pwa"
LEGACY_WORKTREE_ADDED=0

cleanup() {
  if [[ "$LEGACY_WORKTREE_ADDED" == "1" ]]; then
    git worktree remove --force "$LEGACY_DIR" >/dev/null 2>&1 || true
  fi
  rm -rf "$LEGACY_PARENT"
}
trap cleanup EXIT INT TERM

for command_name in git bun npm npx; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

if ! git cat-file -e "${LEGACY_SHA}^{commit}" 2>/dev/null; then
  echo "Missing immutable legacy fixture commit $LEGACY_SHA." >&2
  echo "Fetch repository history before running QA; do not substitute another commit." >&2
  exit 1
fi

echo "==> QA #238: static/type contracts"
npm run lint:types
npm run lint:eslint
npm run lint:prettier

echo "==> QA #238: credential/startup/transport/telemetry regression tests"
npm test -- --run \
  tests/unit/functions/api-middleware.test.ts \
  tests/unit/hooks/useAuthenticatedImageUrl.test.tsx \
  tests/unit/stores/auth-store-credentials.test.ts \
  tests/unit/lib/api-client.test.ts \
  tests/unit/lib/archive-proxy.test.ts \
  tests/unit/lib/archive-transport-gate.test.ts \
  tests/unit/lib/db-credential-migration.test.ts \
  tests/unit/lib/image-blob-cache.test.ts \
  tests/unit/lib/invite-bootstrap-runtime.test.ts \
  tests/unit/lib/legacy-credential-cleanup.test.ts \
  tests/unit/lib/security-startup-gate.test.ts \
  tests/unit/lib/service-worker-security.test.ts \
  tests/unit/lib/startup-security-boundaries.test.ts \
  tests/unit/lib/storage-reset-coordinator.test.ts \
  tests/unit/lib/sync-coordinator.test.ts \
  tests/unit/lib/sentry.test.ts \
  tests/unit/lib/telemetry-redaction.test.ts \
  tests/unit/screens/InviteScreen.test.tsx \
  tests/unit/screens/LoginScreen.test.tsx \
  tests/unit/screens/Home/AddArchiveServerDialog.test.tsx \
  tests/unit/screens/Home/EditArchiveServerDialog.test.tsx \
  tests/unit/components/shared/InsecureArchiveTransportDialog.test.tsx \
  tests/unit/components/shared/SecurityStartupNotice.test.tsx

echo "==> QA #238: current production PWA build + security-build verifier"
npm run build:ci

echo "==> QA #238: build immutable pre-hardening PWA fixture $LEGACY_SHA"
git worktree add --detach "$LEGACY_DIR" "$LEGACY_SHA"
LEGACY_WORKTREE_ADDED=1
(
  cd "$LEGACY_DIR"
  bun install --frozen-lockfile --ignore-scripts
  VITE_PUBLIC_APP_ORIGIN="https://app.comapeo.cloud" bun run build:ci
)

echo "==> QA #238: production startup/SW security including real legacy-worker rollout"
SECURITY_E2E_LEGACY_DIST_DIR="$LEGACY_DIR/dist" bun run test:e2e:security-production

echo "==> QA #238: cross-browser credential persistence and invite flows"
npx playwright test \
  tests/e2e/security-credential-boundary.e2e.ts \
  tests/e2e/critical-flows.e2e.ts \
  --project=chromium \
  --project=firefox \
  --project=webkit \
  --reporter=list

echo
printf '%s\n' "QA #238 automated checks passed. Continue with docs/qa/238-browser-credential-hardening.md for the human acceptance checklist."
