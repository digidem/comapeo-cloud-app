#!/usr/bin/env bash
set -euo pipefail

echo "=== Fast Validation ==="
npm run lint:prettier
npm run lint:eslint
npm run lint:types
npm run test -- --reporter=dot
echo "=== Fast Validation PASSED ==="
