#!/usr/bin/env bash
set -euo pipefail

# Issue #269 — Case evidence selection + disclosure foundation QA.
# Run from the repository root. WebKit requires Playwright host dependencies.

printf '\n[269] 1/7 Formatting, lint, and types\n'
npm run lint:prettier
npm run lint:eslint
npm run lint:types

printf '\n[269] 2/7 Focused evidence/disclosure unit + component coverage\n'
npm run test:unit -- \
  tests/unit/lib/case-evidence.test.ts \
  tests/unit/lib/case-disclosure.test.ts \
  tests/unit/lib/case-disclosure-persistence.test.ts \
  tests/unit/lib/case-evidence-derivative.test.ts \
  tests/unit/hooks/useUpsertCaseReportDisclosure.test.tsx \
  tests/unit/components/shared/AddToCaseDialog.test.tsx \
  tests/unit/components/shared/CaseEvidenceWorkspace.test.tsx \
  tests/unit/components/shared/CaseReportDisclosurePanel.test.tsx \
  tests/unit/screens/DataScreen.test.tsx \
  tests/unit/screens/AlertsScreen.test.tsx \
  tests/unit/screens/CasesScreen.test.tsx \
  tests/unit/screens/CaseDetailScreen.test.tsx \
  tests/unit/lib/db.test.ts

printf '\n[269] 3/7 i18n extraction integrity\n'
npm run check:i18n

printf '\n[269] 4/7 Production build + security verifier\n'
npm run build

printf '\n[269] 5/7 Static Storybook build\n'
npm run build-storybook

printf '\n[269] 6/7 Case browser QA — Chromium and Firefox\n'
npx playwright test tests/e2e/cases.e2e.ts --project=chromium --retries=0 --reporter=list
npx playwright test tests/e2e/cases.e2e.ts --project=firefox --retries=0 --reporter=list

printf '\n[269] 7/7 Case browser QA — WebKit\n'
npx playwright test tests/e2e/cases.e2e.ts --project=webkit --retries=0 --reporter=list

printf '\n[269] PASS — all issue #269 QA gates completed successfully.\n'
