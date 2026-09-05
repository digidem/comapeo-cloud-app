# QA Script — Issue #270: Project report branding

## Scope

This QA validates project-scoped report branding added by issue #270:

- editable organization name that defaults to the project name but remains independent from it
- optional PNG/JPEG/WebP report logo that is separate from the project icon
- 2 MB encoded-file limit and 2048×2048 decoded-dimension limit
- MIME/signature validation that rejects SVG and spoofed image content
- local IndexedDB persistence for both local and remote-backed project records
- preservation of local report branding during normal remote project reconciliation
- immutable report-branding snapshots with exact logo bytes, version id, SHA-256, MIME type, and dimensions
- Home-screen access, project-action visual consistency, keyboard-accessible controls, and responsive behavior at 1440×900 and 375×812
- offline edit/save/reopen behavior for local project branding
- English, Portuguese, and Spanish message coverage

Remote D1/R2 upload/synchronization is intentionally **out of scope** for issue #270. The branding contract stores self-contained local bytes and exposes no public asset URL; later report-sync work must preserve the private authorization boundary rather than making report logos public.

## Prerequisites

1. Check out the exact candidate commit/PR being evaluated.
2. Use Node.js 22+ and install the repository dependencies.
3. For local cross-browser QA, install Playwright browser engines and host libraries. On Linux with package-install privileges:

   ```bash
   npx playwright install --with-deps chromium firefox webkit
   ```

4. If WebKit cannot launch because the host is missing GTK/GStreamer/WebKit libraries, use the exact candidate SHA's terminal-green GitHub Actions WebKit result as acceptance evidence. A browser launch failure that occurs before the app starts is an environment failure, not a product failure.

## Automated QA

Run the following from the repository root:

```bash
npm run lint:eslint
npm run lint:types
npm run lint:prettier
npm run build
npm test -- tests/unit/lib/reports/report-branding.test.ts tests/unit/lib/reports/report-branding-persistence.test.ts tests/unit/screens/Home/ReportBrandingDialog.test.tsx tests/unit/screens/Home/ProjectBannerCard.test.tsx tests/unit/screens/Home/HomeScreen.test.tsx tests/unit/i18n/locale-messages.test.ts tests/unit/i18n/load-messages.test.ts
npx vitest run --project=unit --coverage --coverage.include=src/lib/reports/report-branding.ts --coverage.include=src/screens/Home/ReportBrandingDialog.tsx tests/unit/lib/reports/report-branding.test.ts tests/unit/lib/reports/report-branding-persistence.test.ts tests/unit/screens/Home/ReportBrandingDialog.test.tsx
npx playwright test tests/e2e/report-branding.e2e.ts --project=chromium --reporter=list
npx playwright test tests/e2e/report-branding.e2e.ts --project=firefox --reporter=list
```

When WebKit host dependencies are installed, also run:

```bash
npx playwright test tests/e2e/report-branding.e2e.ts --project=webkit --reporter=list
```

### Expected automated result

- lint, typecheck, formatting, and production build exit `0`
- focused branding/Home/i18n unit tests pass
- targeted new-code coverage clears the repository 80% global thresholds for statements, branches, functions, and lines
- Chromium and Firefox pass both the desktop and mobile/offline branding flows
- WebKit passes locally or is proven by exact-SHA CI when the local host cannot launch WebKit

## Human / live-preview acceptance checklist

Use the exact Cloudflare Pages preview deployment produced for the candidate PR/SHA. Do not substitute a different staging build.

### 1. Create/open a project

1. Open the preview at **1440×900**.
2. If no project exists, create a local project named `QA Branding Project`.
3. Confirm the selected project's Home banner exposes **Report branding**.
4. Open the editor.

Expected:

- the Home **Report branding** action matches the neighboring project-action treatment (height, border/background, typography, hover/focus behavior) and includes a small branding/image icon
- the dialog title is `Report branding`
- Organization name defaults to `QA Branding Project`
- the copy clearly states that report branding is separate from the project icon
- no logo is configured initially
- Upload logo, Cancel, and Save branding are reachable by keyboard

### 2. Organization-name independence

1. Change Organization name to `Forest Guardians Association`.
2. Save.
3. Reopen Report branding.

Expected:

- `Forest Guardians Association` persists
- the project name remains `QA Branding Project`
- editing the report organization name does not modify the project icon or project name

### 3. Valid logo lifecycle

1. Upload a small valid PNG.
2. Confirm the UI changes to `Report logo configured`, displays the actual image in a compact contained preview, and offers Replace logo / Remove logo.
3. Save and close.
4. Reopen the editor and confirm the same logo preview is rendered from persisted branding bytes.
5. Replace the PNG with a valid JPEG or WebP and save again.
6. Reopen and select Remove logo, then save.

Expected:

- each valid image is accepted and visibly previewed without exposing a file path or public asset URL
- logo state and preview survive close/reopen
- removing the logo leaves the organization name intact
- no unrelated local files or file paths are exposed by the UI

### 4. Validation and failure paths

Verify each of the following is rejected before branding state is persisted:

- SVG or another unsupported MIME type
- a file whose declared MIME type does not match its image signature
- a file larger than 2 MB
- an image with a decoded width or height greater than 2048 pixels

Expected:

- a clear localized validation message is shown
- Save does not persist the invalid logo
- while an image is still decoding/validating, Save branding is disabled

### 5. Mobile + offline

1. Resize/use a mobile browser at **375×812**.
2. Open Report branding for the project.
3. Confirm the dialog and buttons fit without horizontal page overflow.
4. Switch the browser/network context offline.
5. Change Organization name to `Offline Forest Association` and upload a valid small PNG.
6. Save.
7. Immediately reopen Report branding while still offline.

Expected:

- save succeeds fully offline
- immediate reopen shows `Offline Forest Association`
- the configured logo is still present
- no horizontal overflow occurs at 375×812
- no remote server is required for the local branding lifecycle

Restore network connectivity after the check.

### 6. Localization

Repeat opening the branding editor with the UI set to Portuguese and Spanish.

Expected:

- the new labels, help text, validation messages, and action labels are translated
- no raw message IDs or unintended English fallback appear for the new branding strings

### 7. Remote-backed project boundary

If a test archive/project is safely available in the preview environment, open Report branding for a remote-backed project and save a local branding change.

Expected:

- the editor works without exposing or generating a public logo URL
- a later archive refresh does not silently erase the locally stored branding value
- no claim is made that remote branding upload/sync is already implemented

Do not create or expose production credentials solely to execute this optional check; unit/integration coverage is the fallback evidence for reconciliation preservation.

## Known limitations / intentionally out of scope

- Remote report branding upload, D1 metadata, R2 object lifecycle, and authenticated report-sync endpoints belong to the later remote reporting-sync work, not issue #270.
- This issue establishes the immutable branding snapshot contract but does not itself add the final report renderer/finalization consumer.
- Multi-organization/co-signed report branding is not part of this issue.
- A local WebKit launch failure caused solely by missing host libraries must be replaced with exact-SHA CI evidence rather than treated as an implementation failure.

## Cleanup

- Remove only the temporary `QA Branding Project` created for preview QA if it is safe to do so.
- Restore the browser/network from offline mode.
- Do not reset or clean unrelated local project data or unrelated worktree changes.

## QA result record

Record in the PR/handoff:

- tested commit SHA:
- live target-branch tip SHA:
- preview deployment URL:
- tester:
- date:
- lint/type/build: PASS / FAIL
- focused unit + targeted coverage: PASS / FAIL
- Chromium desktop 1440×900: PASS / FAIL
- Chromium mobile/offline 375×812: PASS / FAIL
- Firefox branding flows: PASS / FAIL
- WebKit: LOCAL PASS / CI EXACT-SHA PASS / FAIL
- Portuguese/Spanish: PASS / FAIL
- optional remote-backed project preservation: PASS / FAIL / NOT RUN (reason)
- unresolved defects:

The PR is ready to merge only when all applicable checks above pass, GitHub CI is terminal green, independent review has no blocker/should-fix findings, all actionable review threads are resolved, the PR is cleanly mergeable against the current live base tip, and this QA document is linked from the PR body.
