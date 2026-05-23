#!/usr/bin/env bash
set -euo pipefail

echo "=== Full Validation ==="
npm run lint
npm run test:coverage
npm run build
npm run check:i18n
echo "=== Full Validation PASSED ==="
