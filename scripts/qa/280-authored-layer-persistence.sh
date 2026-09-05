#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

QA_PORT="${COMAPEO_QA_280_PORT:-52780}"
QA_BASE_URL="http://127.0.0.1:${QA_PORT}"
SERVER_LOG="${TMPDIR:-/tmp}/comapeo-qa-280-vite.log"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "==> QA #280: type/lint/format/i18n contracts"
npm run lint:types
npm run lint:eslint
npm run lint:prettier
I18N_HASH_BEFORE="$(sha256sum src/i18n/messages/en.json | awk '{print $1}')"
npm run extract-messages
I18N_HASH_AFTER="$(sha256sum src/i18n/messages/en.json | awk '{print $1}')"
if [[ "$I18N_HASH_BEFORE" != "$I18N_HASH_AFTER" ]]; then
  echo "Extracted English messages were out of date." >&2
  exit 1
fi

echo "==> QA #280: persistence, recovery, package, and i18n unit coverage"
npm test -- --run \
  tests/unit/lib/schemas/saved-map.test.ts \
  tests/unit/lib/map/saved-map-authoring.test.ts \
  tests/unit/lib/map/authored-layer-factory.test.ts \
  tests/unit/lib/map/smp-download.test.ts \
  tests/unit/hooks/useMaps.test.tsx \
  tests/unit/screens/MapScreen/AuthoredLayersControl.test.tsx \
  tests/unit/screens/MapScreen/MapScreen.test.tsx \
  tests/unit/screens/MapScreen/DownloadPanel.test.tsx \
  tests/unit/screens/MapScreen/SavedMapsList.test.tsx \
  tests/unit/i18n/load-messages.test.ts \
  tests/unit/i18n/locale-messages.test.ts

echo "==> QA #280: production PWA build"
npm run build:ci

echo "==> QA #280: isolated production preview on ${QA_BASE_URL}"
npx vite preview --host 127.0.0.1 --port "$QA_PORT" >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 60); do
  if curl --fail --silent --show-error "$QA_BASE_URL/" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Preview server exited unexpectedly. Log:" >&2
    cat "$SERVER_LOG" >&2
    exit 1
  fi
  sleep 0.5
done
curl --fail --silent --show-error "$QA_BASE_URL/" >/dev/null

echo "==> QA #280: save/reopen authored-layer UI in Chromium and Firefox"
BASE_URL="$QA_BASE_URL" npx playwright test tests/e2e/map-download.e2e.ts \
  --project=chromium \
  --project=firefox \
  --grep "persisted authored GeoJSON layers" \
  --reporter=list

if [[ "${COMAPEO_QA_280_WEBKIT:-0}" == "1" ]]; then
  echo "==> QA #280: save/reopen authored-layer UI in WebKit"
  BASE_URL="$QA_BASE_URL" npx playwright test tests/e2e/map-download.e2e.ts \
    --project=webkit \
    --grep "persisted authored GeoJSON layers" \
    --reporter=list
else
  echo "==> QA #280: WebKit local run skipped; require exact-SHA CI evidence before merge readiness"
fi

echo "==> QA #280: production SMP offline preview/activation in Chromium and Firefox"
BASE_URL="$QA_BASE_URL" VITE_PREVIEW=1 npx playwright test \
  tests/e2e/map-offline-cold-start.e2e.ts \
  --project=chromium \
  --project=firefox \
  --reporter=list

echo "==> QA #280: desktop + 375x812 recovery/privacy/error screenshots"
BASE_URL="$QA_BASE_URL" npx playwright test \
  tests/e2e/map-authored-layers.screenshots.ts \
  --project=screenshot \
  --reporter=list

echo
printf '%s\n' "QA #280 automated checks passed. Continue with docs/qa/280.md for the live/manual acceptance checklist."
