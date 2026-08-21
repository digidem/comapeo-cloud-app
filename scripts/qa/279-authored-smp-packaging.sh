#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "==> QA #279: TypeScript contract"
npm run lint:types

echo "==> QA #279: Authored-layer and SMP packaging unit/integration coverage"
npm test -- --run \
  tests/unit/lib/map/authored-layers.test.ts \
  tests/unit/lib/map/authored-layers-smp.test.ts \
  tests/unit/lib/map/authored-payload-estimate.test.ts \
  tests/unit/lib/map/authored-raster.test.ts \
  tests/unit/lib/map/authored-smp-merge.test.ts \
  tests/unit/lib/map/authored-style.test.ts \
  tests/unit/lib/map/authored-writer.test.ts \
  tests/unit/lib/map/smp-download.test.ts \
  tests/unit/lib/map/smp-zip.test.ts \
  tests/unit/lib/schemas/saved-map.test.ts

echo "==> QA #279: Raw DEFLATE support in Chromium, Firefox, and WebKit"
npx playwright test tests/e2e/smp-deflate-raw.e2e.ts \
  --project=chromium \
  --project=firefox \
  --project=webkit \
  --reporter=list

echo
printf '%s\n' "QA #279 automated checks passed. Continue with docs/qa/279-authored-smp-packaging.md for the human acceptance checklist."
