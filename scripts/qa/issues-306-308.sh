#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "==> QA #306/#308: TypeScript contract"
npm run lint:types

echo "==> QA #306/#308: map stacking unit coverage"
npx vitest run --project=unit \
  tests/unit/screens/AlertsScreen.test.tsx \
  tests/unit/screens/MapScreen/MapScreen.test.tsx \
  tests/unit/screens/MapScreen/MapAuthoringCanvas.test.tsx \
  tests/unit/components/shared/MapContainer/MapContainer.test.tsx \
  tests/unit/components/shared/AlertsMap.test.tsx \
  tests/unit/components/shared/ObservationsMap.test.tsx

echo "==> QA #306: mobile Alerts map stacking"
CI= npx playwright test tests/e2e/alerts-map.e2e.ts \
  --project=chromium \
  --grep "mobile sheet exposes map selection" \
  --retries=0 \
  --reporter=list

echo "==> QA #308: mobile map-authoring stacking"
CI= npx playwright test tests/e2e/map-overlay-stacking.e2e.ts \
  --project=chromium \
  --retries=0 \
  --reporter=list

echo "==> QA #306/#308: production build"
npm run build

echo
printf '%s\n' "QA #306/#308 automated checks passed. Continue with docs/qa/issues-306-308.md for deployed mobile/desktop and empty-state visual checks."
