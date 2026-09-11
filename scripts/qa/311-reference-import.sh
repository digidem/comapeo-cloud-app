#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

FILES=(
  src/lib/map/reference-layer-import.ts
  tests/unit/lib/map/reference-layer-import.test.ts
  tests/unit/lib/map/reference-layer-import.archive-stream.test.ts
  tests/fixtures/reference-import/generated.ts
  tests/e2e/reference-layer-import.e2e.ts
  scripts/qa/311-reference-import-bundle.ts
)

echo "[311] formatting"
npx prettier --check "${FILES[@]}" tests/fixtures/reference-import/README.md docs/qa/311.md

echo "[311] eslint"
npx eslint "${FILES[@]}"

echo "[311] types"
npm run lint:types

echo "[311] importer + canonical regression tests"
npm test -- \
  tests/unit/lib/map/reference-layer-import.test.ts \
  tests/unit/lib/map/reference-layer-import.archive-stream.test.ts \
  tests/unit/lib/map/authored-layers.test.ts \
  tests/unit/lib/map/geojson-overlays.test.ts

echo "[311] focused coverage"
npx vitest run --project=unit \
  tests/unit/lib/map/reference-layer-import.test.ts \
  tests/unit/lib/map/reference-layer-import.archive-stream.test.ts \
  --coverage \
  --coverage.include=src/lib/map/reference-layer-import.ts

echo "[311] lazy bundle probe"
npx tsx scripts/qa/311-reference-import-bundle.ts

echo "[311] proj4 resolution"
npm ls proj4 --all

echo "[311] production build"
npm run build:ci

echo "[311] Chromium/Firefox/WebKit browser primitive matrix"
npx playwright test tests/e2e/reference-layer-import.e2e.ts --reporter=list

echo "[311] PASS"
