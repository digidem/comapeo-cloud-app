# CoMapeo Cloud App — Issue #336 implementation-ready spec

**Issue:** #336 — Alerts created on the app are not sent into the Remote Archive
**Base:** `origin/main` at `763c188feeff23b536cf870212e9c4bd9892e940` (2026-09-03), inspected 2026-09-03
**Supersedes:** none
**Superseded-by:** none
**Status:** implementation-ready (single unit — one independently mergeable PR; no split required: no PR1/PR2 gate, one ownership boundary, one coherent reviewable objective)

This spec is the canonical single source of truth for issue #336. Where the issue body and this file disagree, this file wins.

---

## Goal

When a user creates an alert for an **archive-bound project**, the app must **issue the real `POST /projects/:id/remoteDetectionAlerts` request** to that project's owning archive (server source of truth), rather than only writing a local-only row that never leaves the device. After a successful POST, the app re-fetches the archive's alert collection so the **server-generated** alert row (with its real server `docId`) is the one displayed — no transient local duplicate is retained.

Today creating an alert only persists a `sourceType: 'local'` row in IndexedDB and never performs any network request. The transport (`apiClient.createAlert`, `createAlertBodySchema`, MSW fixtures, server route) already exists and is fully typed and tested at the API-client layer — but **nothing in the app calls it**. This issue completes the write path.

## Product model (DECIDED)

- **The server is the source of truth.** Creating an alert means: (1) `POST /projects/:remoteId/remoteDetectionAlerts` to the owning archive; (2) after a `201`, **GET/re-fetch** the alert collection so the generated alert (server-assigned `docId`) is displayed.
- Reason (normative, from upstream): the archive's POST returns **201 with an empty body** (`tests/mocks/handlers.ts` same), and `@comapeo/core`'s `DataType.create` mints a **random** `docId` server-side (`randomBytes(32)`) that is never returned to the client. Therefore the client **cannot predict or learn** the docId from the POST; a follow-up GET is the only reliable way to obtain the canonical row. Do not attempt to correlate a local row to a server docId.
- After a successful POST, **do not keep a distinct local alert row + merge**. Display the archive-echoed alert (see Display of the created alert). Leaving a parallel local row would produce a duplicate in the list (the local row and the pulled server row both appear) with no reliable correlation key.
- For an archive-bound project whose alerts list/map are fed by local-index reads of `db.alerts` **and** the archive ECHO, the create completes when the echo lands; see Display of the created alert.

## Non-goals

- No new push/outbox/queue mechanism and no periodic or sync-pass "flush of dirtyLocal alerts." Creation is synchronous and server-authoritative.
- No changes to the **pull-only** reconciliation engine in `src/lib/sync.ts` / `src/lib/reconciliation.ts`, the `remote-archive.ts` `pull*` contract, or the `Alert` DB row schema / storage-reset invariants. (No new fields are added to the `Alert` row — the selected design does not need them, because no local row is retained for archive-bound creates.)
- No implementation of sync/push for any **other** resource (observations, cases, presets, etc.). Issue #336 is alerts-only.
- No server (`comapeo-cloud`) changes; the endpoint described in `docs/remote-archive-api-spec.md` is already implemented and returns 201 empty.
- No change to the **raw API** `apiClient.createAlert` request method, `createAlertBodySchema`, or the existing MSW/indexed fixtures — they are correct and reused as-is.
- No visual/design changes beyond adding the archive echo/refetch behind the existing create UI. Existing strings/IDs are reused; new i18n IDs are limited to any new error/surface copy.

## Product behavior / UX

Alert creation is reachable from two places, both keyed to the selected project (`selectedProjectId`):
- `src/screens/CreateAlertScreen.tsx` (full form via `AlertForm`, `route` `/alerts/new`)
- Alerts **map** inline creation (`AlertsScreen` → `InlineAlertCreationPanel` → `AlertForm`)

Today `AlertForm` calls `useCreateAlert` → `data-layer.createAlert` → `local-repositories.createAlert` (local-only). In every archive-bound case the UI must instead drive the server path:

1. **Resolve the owning archive from the selected project.** `AlertForm` receives only `projectLocalId`; it must additionally surface the owning-server/remote context. Follow the exact production pattern in `CategoriesEditor/index.tsx:86-112`: resolve `owningServer = servers.find(s => s.id === selectedProject.sourceId)`, build `serverConfig = { serverId, baseUrl, token }` (present only when `owningServer?.token`), and derive `projectRemoteId = selectedProject.remoteId`.
2. **`if` the selected project has an owning server with a token and a `remoteId`** (archive-backed): the submit handler must:
   - Build the POST body exactly per `createAlertBodySchema` (`geometry`, `detectionDateStart`, `detectionDateEnd`, `sourceId`, `metadata`) from the same form fields ALREADY collected today (the AlertForm `onSubmit` already assembles `geometry`, `metadata` incl. `alert_type`, ISO dates, `sourceId`). Surface a **pending** state on the submit button (reuse existing `createAlert.isPending` semantics; keep the button disabled while in flight).
   - `await apiClient.createAlert(projectRemoteId, body, serverConfig)`.
   - On `{ success: true }` (201): do **NOT** write a local `sourceType:'local'` alert. Instead **invalidate/refetch the project's alerts** so the archive echo (server row returned by the next alerts fetch/pull, carrying the server `docId`) becomes the displayed result; then call the existing success continuation. In both create entry points today success navigates to `/alerts` (`CreateAlertScreen`) or closes the inline panel (`AlertsScreen`).
   - On non-201 (or a thrown `ApiError`), surface the existing `alerts.create.failed` toast/`createFailed` copy and leave the form open; do not persist anything. Do not swallow the error as a success.
3. **`else` if the selected project is NOT archive-backed** (no owning server / no token / no `remoteId` — i.e. a pure-local selected project or one whose archive disconnected): **keep the current local-only behavior** exactly (`data-layer.createAlert` / `local-repositories.createAlert`), because there is no archive to reach. This is unchanged today's behavior. (Issue intent — Mobile only ever receives alerts via an archive — means this path does not help Mobile, but it does not regress offline/local create and is explicitly scoped as the retained legacy path.)
4. **Idempotency / re-submit guard:** while a POST is in flight, disable the submit button (existing disabled-when-pending wiring); the archive accepts a repeated POST with the same body as independent read-only `remoteDetectionAlert` records (upstream returns 201 each time), and the follow-up fetch lands whichever rows exist. No special client dedupe of separate user submissions is required.

### Display of the created alert

Normative meaning of "display the server-generated alert": after a successful POST, the user's alerts list/map must reflect the just-created alert as the canonical archive row. Concretely, the app must **refetch alerts for the project and wait for a resolved alert set that contains a non-deleted row matching the submitted geometry/sourceId** before reporting success, rather than reporting success from a blind re-query that may race ahead of propagation.

Because the codebase has two project shapes (`remoteArchive` replica entries carrying `sourceId`+`remoteId`, and local entries that may bind an archive via `serverUrl`), the echo lands under the alert-listing mechanism associated with the selected project:

- Where the selected project's alerts are surfaced by the current `useAlerts(projectLocalId)` hook reading `db.alerts`, the new flow must, after 201, invalidate `['alerts', projectLocalId]` **and** re-enable the server reflection that populates `db.alerts` rows from the archive for that project (`pullAlertsDetailed`), then **wait** until the echoed row with the matching geometry is present (poll with bounded retries; on exhaustion report failure rather than fabricating success). Implementation may reuse the existing archive alerts fetch entry (see `src/lib/remote-archive.ts` `pullAlertsDetailed` + sync resource) scoped to the selected project + owning server, mirroring how `CategoriesEditor` triggers per-project archive reads. This seam is the **headline cross-area interface**; see the Cross-area seam note.

The acceptance criterion is that success is reported only after the server echo is visible; a server-authoritative create is not "success" merely because the POST returned 201 if the resulting row cannot be surfaced.

## Current-code constraints (verified at base SHA)

- `src/screens/CreateAlertScreen.tsx` renders `AlertForm` with only `projectLocalId` and navigates to `/alerts` on success/cancel; it does resolve `selectedProject` but never threads owning-server context into the form.
- `src/components/shared/AlertForm.tsx` is the single form used by both the standalone screen and the inline map panel. Its `onSubmit` already builds `{ projectLocalId, geometry, metadata: {...metadata, alert_type}, detectionDateStart, detectionDateEnd, sourceId }` and calls `createAlert.mutate(...)`; on success calls `onSuccess`. It has an internal `createFailed` error `i18n` message and disables the submit button while `createAlert.isPending || !projectLocalId`.
- `src/components/shared/InlineAlertCreationPanel.tsx` wraps `AlertForm` (compact variant, Point-only) and closes on success.
- `src/hooks/useCreateAlert.ts` currently calls `data-layer.createAlert` (local write) and invalidates `['alerts', projectLocalId]` on success. This hook or its equivalent must become archive-aware (see Ownership boundary).
- `src/screens/AlertsScreen.tsx` reads alerts via `useAlerts(selectedProjectId)` and opens inline creation on the map (`interactionMode:'create-point'`).
- `src/hooks/useAlerts.ts` = `useQuery(['alerts', projectLocalId], () => getAlerts(projectLocalId))`.
- `apiClient.createAlert(projectId, body, config): Promise<{ success: true }>` exists (`src/lib/api-client.ts`); POST to `${baseUrl}/projects/${projectId}${ALERTS_PATH}`, 201 => `{ success: true }`, other statuses throw `ApiError`. Auth via `getAuthHeaders(credentials)` from the config's token; on 401 it locks the credential (existing behavior). `ALERTS_PATH = '/remoteDetectionAlerts'`.
- `createAlertBodySchema` (`src/lib/schemas/alert.ts`) matches the server route body exactly.
- MSW `tests/mocks/handlers.ts:293` already handles `POST */projects/*/remoteDetectionAlerts` (Bearer + geometry required, else 400; returns 201 empty) and `GET .../remoteDetectionAlerts` returns `alertsFixture`; `GET .../remoteDetectionAlerts/:alertId` returns one. `tests/mocks/node.ts` runs globally in unit tests (`tests/setup.ts`).
- The owning-server resolution production reference is `src/screens/CategoriesEditor/index.tsx:84-116` (declared in code as the canonical pattern for `useApiPresets`/`useApiFields`), including the comment that `remoteId` is the server `projectPublicId` (base32) — never the local hex id — and that route requests go through the selected project's owning server rather than the active server.
- i18n messages live in `src/i18n/messages/{en,pt,es}.json`; use `npm run extract-messages` reusing existing alert error strings where possible.
- No new `Alert` DB row fields; no storage-reset change; no Dexie schema bump.

## Ownership boundary and exported symbols (DECIDED)

**Canonical helper — resolve/create where alert creation happens.** Introduce a single archive-aware create path so both form entry points share it and local-only behavior is preserved in exactly one place:

- `src/lib/data-layer.ts`: add `createAlertForProject(projectLocalId)` — or extend existing `createAlert` so the same call both decides archive-backed vs local and performs the write. **Normative ownership:** exactly one place decides "archive-backed create" vs "local-only create"; both `CreateAlertScreen` and the map inline path call the SAME function/hook, so they can never drift. The function exports a discriminated result so the caller can render success/failure identically (e.g. `{ ok: true } | { ok: false; reason: 'no-archive' | 'unauthenticated-archive' | 'request-failed' }`). It owns:
  - resolving owning server + `remoteId` from the selected project (CategoriesEditor pattern),
  - the POST when archive-backed,
  - the post-POST echo wait and alerts invalidation (see Display of the created alert),
  - the local-only write fallback,
  - so submission errors surface and are never reported as success.
- `src/hooks/useCreateAlert.ts`: repoint at the archive-aware data-layer path (keeps its query-invalidation contract + provider identity). It remains the hook consumed by `AlertForm`; existing unit tests must not regress for local-only inputs.
- `src/screens/CreateAlertScreen.tsx` and `AlertsScreen` inline panel: NO new network logic — they only need to pass enough ownership context (the selected project object/`localId`) and keep their existing success navigation/close. Where the archive-aware helper needs owning-server/token from the auth store, it resolves those inside `lib`/the hook (CategoriesEditor reads from `useAuthStore`/`useProjects` at the screen; the shared helper must therefore receive the resolved inputs or use the stores non-react-safe getters where appropriate — see seam note).

**Failure surfacing:** `AlertForm` already shows `createFailed` on `createAlert.isError`; ensure the archive-aware mutation rejects (or sets `isError`) for all non-success outcomes so that copy renders and the form stays open. Add a distinct copy only if the archive-unreachable branch needs to tell the user the archive requires a reconnect; otherwise reuse.

### Cross-area seam (DECIDED — the alert-echo reflection)

The create flow needs the **server echo** surfaced into the same list the UI reads. The seam is between this PR (create → POST → invalidate) and the existing **archive alerts fetch/pull** machinery (`pullAlertsDetailed` in `src/lib/remote-archive.ts`, run per archive project by `sync.ts`). To avoid specifying two alert syncing mechanisms:

- **Ownership:** the **alerts echo fetch for the selected project + owning server** is owned by THIS issue's helper as a direct, scoped call to the existing `pullAlertsDetailed`/equivalent (not a new syncing subsystem). The create success wait uses that same call path.
- **Consumption:** the UI list (`useAlerts(selectedProjectId)`) must observe the echo. Reuse/trigger invalidation of the `['alerts', ...]` query keys after the echo lands (the existing `INVALIDATED_QUERY_ROOTS`/`useCreateAlert` pattern) rather than adding a second store.
- Where the selected project is a `remoteArchive` replica whose list is populated only via the sync pull, the helper's echo call must write into the SAME project `db.alerts` grouping that `useAlerts(selectedProjectId)` reads. The exact project `projectLocalId` used by the echo write and by the query must match (assert in tests). Confirm the owning alert list source type for the selected project shape during implementation and, if the project shape requires it, route the echo through that project's canonical archive pull.
- The submission must **wait** for the echoed row (geometry/source matched) with bounded retries, else report failure. Exact retry bound: e.g. up to 5 attempts / ~5s total (implementer may tune; the contract is "bounded wait, then failure not fake success"). Unit tests should control the echo timing deterministically.

## Key implementation files

| File | Change |
|---|---|
| `src/lib/data-layer.ts` | add archive-aware, server-source-of-truth create path (owns archive-vs-local decision, POST, echo wait, local fallback); keep `createAlert` name/shape extension backward-compatible or a new named export per Ownership boundary |
| `src/hooks/useCreateAlert.ts` | repoint to archive-aware path; keep provider identity + `['alerts', projectLocalId]` invalidation; local-only path unchanged |
| `src/components/shared/AlertForm.tsx` | (minimal) thread needed ownership context if any; keep submit assemble; ensure pending + failure states already used; NO duplicate network logic |
| `src/screens/CreateAlertScreen.tsx` | (minimal) pass selected-project ownership context to form if the helper needs it; keep success navigation |
| `src/screens/AlertsScreen.tsx` + `InlineAlertCreationPanel.tsx` | (no behavior network change) success closes panel as today; confirm echo wait/refetch triggers the same list the user sees |
| `tests/unit/lib/data-layer.test.ts` | extend for archive-aware create (already has local `createAlert` tests at `data-layer.test.ts:73`) |
| `tests/unit/hooks/useCreateAlert.test.ts` | existing local-only tests pass; new archive-backed cases over MSW |
| `tests/unit/screens/CreateAlertScreen.test.tsx` (or AlertsScreen) | archive-backed project create → POST fired, no local row, list shows echoed server alert; local-only → unchanged local write |
| `docs/qa/336.md` | REQUIRED Human-QA handoff (see below) |

Reused unchanged: `apiClient.createAlert`, `createAlertBodySchema`, `tests/mocks/handlers.ts` POST/GET, `tests/fixtures/alerts.ts`, `remote-archive.ts pullAlertsDetailed`. Any i18n additions only via `npm run extract-messages` into `en/pt/es`.

## Security / privacy / offline / failure behavior

- The POST authenticates with the owning archive server's stored **token** via the existing `resolveApiRequest`/auth flow; a 401 triggers the existing credential-lock/handling — no new secret handling.
- No browser-storage written outside the existing IndexedDB operations already governed by the storage-reset guardrails; **no new local-only alert is written on the archive-backed path**, so there is no newly-resettable local data and no storage-reset-invariant change.
- Offline / archive unreachable while archive-backed: the POST fails (network error ⇒ `ApiError`/network classification); surface `createFailed`; do NOT fall back to a silent local write (that would recreate the bug — a row that never reaches the archive but looks created). Local-only projects keep their local write.
- No privacy exposure beyond the exact geometry/metadata the user submits (already shown locally today); same payload that a manual archive call would send.

## Acceptance criteria (deterministic)

1. On an **archive-bound** selected project, submitting the alert form performs exactly **one** `POST /projects/{remoteId}/remoteDetectionAlerts` to the owning archive (Bearer + body per `createAlertBodySchema`), and does **not** write a `sourceType:'local'` alert row.
2. After the archive `201`, the app (re)fetches the archive alerts for that project, and success is reported **only once** an echoed alert row matching the submitted geometry/sourceId is present in the surfaced list (assert via the shown list in the UI test). It does not report success from a blind refetch that returns before the row appears.
3. Failure of the POST (network error, non-201, 401/403-authorization) surfaces the existing `createFailed` copy, the form stays open, submit re-enabled, and **no** local row is written.
4. If the selected project is **not** archive-backed (no owning server token / no `remoteId`), submit keeps the current local-only `data-layer.createAlert` write exactly (existing tests pass unchanged).
5. Both create entry points (standalone `/alerts/new` and map inline) call the same shared create path and surface the same success/failure — assert shared-path selection via tests, not duplicated logic.
6. Alerts list/map reflects the created alert (server echo) after create in the archive-bound case; the prior local-ish list remains consistent.
7. `useCreateAlert` still invalidates `['alerts', projectLocalId]`; existing local-only `useCreateAlert.test.tsx` cases pass.
8. Hidden/offline UX: while a POST is in flight the submit is disabled; no success until server echo or failure.
9. No changes to `reconciliation.ts`, `sync.ts`, or `Alert` DB row schema/types (no new row fields, no Dexie version bump). `apiClient.createAlert` and `createAlertBodySchema` unchanged.
10. All user-facing copy through react-intl; en/pt/es carry every new key; `npm run extract-messages` adds only new keys; i18n CI check green.
11. `npm run lint:types`, `npm run lint:eslint`, `npm run lint:prettier` clean; `npm run test:coverage` ≥ 80% (enforced globally per `vitest.config.ts`).
12. Unit tests added/updated per the list below pass under the global MSW server (test double 201 empty). Real end-to-end gateway behavior is captured in `docs/qa/336.md`.

## Required tests

`tests/unit/lib/data-layer.test.ts` (EXTEND):
- archive-backed create calls `apiClient.createAlert` with the project `remoteId` body + owning `serverConfig`; POST 201 => success; no local alert row written (assert `db.alerts` unchanged for that project)
- archive-backed create where echo fetch returns the new server alert => the surfaced list contains it
- archive-backed create where POST returns non-201/ApiError => rejects, no local row
- archive-backed create whose owning server has no token / no `remoteId` => falls back to local `data-layer.createAlert` (existing behavior) — return the local path signal
- purely local project (no archive) => local write (regression)
- matching geometry/sourceId echo-wait: bounded retries then failure when the archive never echoes (deterministic, e.g. mock the helper's echo fetch to stay empty for N>bound)

`tests/unit/hooks/useCreateAlert.test.tsx` (EXTEND — keeps all existing local-only cases):
- archive-backed input triggers the shared server path and invalidates `['alerts', projectLocalId]` after echo; failure sets `isError` so `AlertForm` shows `createFailed`

`tests/unit/components/shared/AlertForm.test.tsx` (EXTEND — existing pass unchanged):
- pending state disables submit while an archive POST is in flight; on failure form stays open and `failed` copy shows; on success `onSuccess` is called only after the archive echo is resolved

`tests/unit/screens/CreateAlertScreen.test.tsx` / AlertsScreen map create (EXTEND or new):
- archive-bound: POST fired to owning server; no local row; success navigates/flow
- local-only: unchanged local create
- inline map create uses the same shared path (assert single POST count when creating from the map panel)

## TDD order (mandatory)

1. RED: `data-layer.test.ts` archive-aware create cases — POST must fire to owning server, no local row (fails: current lib only writes locally).
2. GREEN: implement the archive-aware create path in `data-layer.ts` (POST + echo wait + local fallback + result type).
3. RED→GREEN: `CreateAlertScreen`/`AlertsScreen` archive-backed + local-only tests; wire screens/hook through the shared path; thread ownership context.
4. RED→GREEN: `AlertForm.test.tsx` pending/failure/success-echo cases.
5. Confirm MSW 201 handler stands in for the server; assert echo-wait determinism.
6. `npm run extract-messages`; fill `pt/es` for any new keys; i18n check.
7. Full `npm test`, `npm run test:coverage` (≥80%), lints.
8. **QA deliverable:** `docs/qa/336.md` per the Human QA Handoff invariant (see below).

## Self-review (P1/P2 pass — resolved in this spec)

- **P1 Duplicate-local-row + unlearnable server docId**: DECIDED — server is source of truth; no local row kept on the archive-backed path; display via archive echo re-fetch. (Upstream POST returns empty 201; core docId is random and never returned.)
- **P1 Two create entry points drifting**: DECIDED — single shared data-layer/hook path; both screens call it.
- **P1 Archive vs active server targeting**: DECIDED — resolve owning server by `selectedProject.sourceId` (CategoriesEditor pattern), NOT the active server.
- **P1 local-only projects**: DECIDED — retain today's local-only create (no archive to reach); no silent fallback write for a reachable-but-failing archive.
- **P1 Echo-wait success semantics**: DECIDED — success reported only after the surfaced list contains the echoed matching alert (bounded retries, else failure); avoids fake success racing ahead of propagation.
- **P2 Which project row type feeds the shown alerts list**: the echo must write into the same `projectLocalId` grouping `useAlerts` reads; ownership and the echo call path are pinned to the existing `pullAlertsDetailed` machinery via the seam note; assert in tests.
- **P2 re-submit/idempotency**: submit disabled while in flight; archive treats repeats as independent rows; no client dedupe needed for distinct user submissions.

## Notes for implementation (cross-repo evidence)

- Server route returns 201 empty for `POST /projects/:projectPublicId/remoteDetectionAlerts`; `list` GET returns rows incl. `docId/sourceId/geometry/...`. Since the client cannot derive `docId`, rely on GET echo (NOT on predicting the id).
- `remoteId` on the project is the server **base32 projectPublicId** (see `src/hooks/useApiPresets.ts` header comment); the POST path must use it, never the local hex `localId`.
- Do not send `alert_type` as a separate top-level field; today's form folds it into `metadata.alert_type` which matches the server body shape (metadata object), and `createAlertBodySchema` expects an object `metadata`. Keep the existing folding.
- The archive is only authoritative for alert records it stores; echoed rows carry the server `docId`, so subsequent alert listings for that archive are server-sourced for what it owns (consistent with current archive reconcile semantics).

### Human QA handoff (`docs/qa/336.md`) REQUIRED

Scope: end-to-end create → archive echo for an archive-bound project, plus the retained local-only path. Include: prerequisites (a dev archive reachable, or rely on the MSW stub for the unit-verified flow plus a manual path list), reproducible steps to create an alert on both entry points and confirm the network tab shows a single POST to `/projects/{id}/remoteDetectionAlerts` with a 201 plus a follow-up GET, expected states (pending button, success after echo shows the alert card once, failure copy on non-2xx and no local write), failure conditions (archive offline/auth: no row, clear error), cleanup (removing the echo alert on the archive so a subsequent manual run observes fresh creation), and known limitations (server docId not exposed by POST; echo propagation latency appears as the post-submit wait; pure-local projects remain local-only by design and are not visible to CoMapeo Mobile, which is the documented limitation that motivates the server-authoritative path).
