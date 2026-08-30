# QA Script — Issue #238: Browser credential hardening

PR: #288 — `fix: harden browser credential handling`

## Scope

This QA validates the browser credential/security boundary implemented by issue #238:

- archive bearer credentials are runtime/session-memory only and are not persisted in IndexedDB, localStorage, sessionStorage, Cache Storage, history, service-worker state, or telemetry
- historical `remoteServers.token` values are purged by the current Dexie migration while archive metadata and offline territorial data remain intact
- encrypted invite URLs are sanitized before application bootstrap and the candidate exists only in bounded private memory
- startup fails closed when legacy storage cleanup or service-worker security verification is incomplete
- the current service worker never caches credential-bearing `/api` traffic or sensitive invite URLs
- a genuinely old cached PWA/Workbox worker cannot forward a historically persisted bearer credential after the hardened server deployment rolls out
- Add Archive, Reconnect, Login, invite redemption, authenticated image loading, and sync use the current credential boundary
- runtime credentials stay bound to the exact archive identity and stale 401 responses cannot lock a newer credential
- HTTP archive transport requires explicit URL-bound approval and approval is invalidated when the URL changes
- invite expiry/unmount aborts authenticated sync I/O and rolls back temporary archive state
- telemetry/Sentry redaction removes credentials and sensitive invite values under explicit resource bounds
- `/api/*` responses receive the required security headers without weakening existing cache policies
- credentials remain isolated per browser tab

Issue #238 intentionally does **not** encrypt offline territorial/project data at rest. That remains separate follow-up work (#278).

## Prerequisites

1. Check out PR #288 at the exact candidate SHA being evaluated.
2. Use Node.js 22+ and Bun 1.3.14 as declared by `package.json`.
3. Install dependencies with:

   ```bash
   bun install --frozen-lockfile --ignore-scripts
   ```

4. Install Playwright Chromium, Firefox, WebKit and required host libraries:

   ```bash
   npx playwright install --with-deps chromium firefox webkit
   ```

5. The repository clone must contain immutable commit `5f5e0685cf88866773e5ed661964debf48013d14`. This is the last credential-persisting PWA fixture used to prove the real old-worker upgrade boundary. If it is missing, fetch repository history; **do not substitute another commit**.
6. For manual archive UI checks, use a non-production test archive server and a disposable bearer token. Never use a production/community credential for QA.
7. For preview QA, use the preview deployment generated for the exact candidate SHA, not an older preview URL/build.

## Automated QA

From the repository root run:

```bash
bash scripts/qa/238-browser-credential-hardening.sh
```

The helper creates a temporary detached worktree for the immutable legacy PWA, builds it, runs the current production security suite against that real legacy build, then removes the temporary worktree on normal exit.

### Expected automated result

The script must exit with status `0` and all phases must pass:

1. TypeScript, ESLint and Prettier checks.
2. Credential/startup/transport/telemetry unit and integration regressions.
3. Current production PWA build and security-build verifier.
4. Immutable pre-hardening PWA fixture build from `5f5e0685…`.
5. Production startup/service-worker security E2E, including the real cached-old-build rollout proof.
6. Chromium, Firefox and WebKit credential-boundary and critical-flow E2E.

The production security E2E is specifically required to prove this sequence:

1. A real old PWA/worker persists an archive bearer token.
2. The server is switched to the hardened deployment while the browser is still executing the stale cached application.
3. The stale application attempts its authenticated `/api` request.
4. The hardened same-origin boundary returns the security-update response and **does not forward the bearer to the archive**.
5. The current worker/application takes over.
6. Historical persisted credential residue is removed and secure startup reaches `ready`.

A synthetic “old worker” that serves the current build is not sufficient evidence for this acceptance criterion.

### Automated failure conditions

QA fails if any of the following occurs after prerequisites are satisfied:

- any command exits non-zero
- a bearer/invite canary is found on a persistent browser surface where the test requires absence
- the real legacy rollout test observes the historical bearer in the simulated upstream/archive-forward log
- the secure-worker revision cannot take control
- current-worker invite navigation leaves the sensitive query/hash/candidate in URL, storage, cache, service-worker messages, or console output
- a browser-specific credential-boundary assertion fails
- production security-build verification fails
- TypeScript/lint/format checks fail

A Playwright engine that cannot launch because required OS libraries are missing is an environment failure, not a product pass. Install the missing dependencies or use the exact candidate SHA's green GitHub Actions cross-browser result before accepting that browser.

## Human acceptance checklist

Use a disposable archive credential. Record the exact candidate SHA and browser version before starting.

### 1. Add an HTTPS archive and verify runtime-only credential storage

1. Open the app with site storage cleared.
2. Add a reachable HTTPS archive server with the disposable bearer token.
3. Confirm the archive connects normally.
4. In browser DevTools, inspect Application/Storage:
   - IndexedDB `remoteServers`
   - localStorage
   - sessionStorage
   - Cache Storage
5. Search for the disposable token value.
6. Reload the page.

Expected:

- The archive metadata remains configured.
- The bearer token is absent from all inspected persistent surfaces.
- After reload, the archive is locked/requires reconnect because the credential was intentionally session-memory only.
- Reconnecting with the token restores access without persisting it.

Failure:

- The token appears in any persistent browser store/cache/history surface.
- Reload silently restores authenticated archive access without new runtime credential input.

### 2. Verify per-tab credential isolation

1. With the archive unlocked in tab A, open the same application in a new tab B.
2. Navigate to archive-dependent data in both tabs.

Expected:

- Tab A keeps its runtime credential.
- Tab B sees the configured archive metadata but remains locked until separately reconnected.
- Unlocking/locking one tab does not leak the bearer into the other tab's persistent storage.

Failure:

- Tab B inherits authenticated access merely because tab A was unlocked.

### 3. Verify encrypted invite URL sanitization

1. Generate a disposable encrypted invite for the test archive.
2. Open the invite URL in a clean tab. Add a harmless unique fragment canary to the URL if practical.
3. Watch the address bar immediately during bootstrap.
4. Allow the invite flow to complete.
5. Inspect IndexedDB, local/session storage and Cache Storage for the invite code, fragment canary and bearer token.
6. Use browser Back/Forward navigation and confirm the sensitive invite query is not restored into the address bar.

Expected:

- The `/invite?...` query and fragment disappear before the normal app flow proceeds.
- Invite redemption succeeds when the server/token are valid.
- Sensitive invite/code/token values are absent from persistent surfaces and navigation history.

Failure:

- The sensitive query/hash remains visible after bootstrap.
- Back/Forward restores the sensitive URL.
- Invite/token values appear in persistent storage/cache.

### 4. Verify insecure HTTP approval is exact-URL bound

Use only a disposable local/test HTTP archive endpoint.

1. Enter an `http://` archive URL.
2. Confirm the insecure-transport warning appears before the bearer is sent.
3. Do **not** approve it yet. Change the archive URL.
4. Confirm the old approval cannot be used for the changed URL.
5. Return to the original URL and approve the warning explicitly.

Expected:

- No bearer-bearing archive request is sent before approval.
- Approval applies only to the exact normalized URL that was approved.
- Changing the URL invalidates pending/stale approval.

Failure:

- A token is sent before approval.
- Approval for URL A authorizes URL B.
- A stale approval is resurrected after URL changes.

### 5. Verify locked/reconnect behavior

1. Configure an archive and reload so the credential is no longer in runtime memory.
2. Open archive details and choose Reconnect.
3. Enter the disposable token and reconnect.
4. Reload again.

Expected:

- The first reload shows the archive as locked/reconnect-required.
- Reconnect succeeds in the current tab only.
- The following reload locks it again.
- No token is added to persistent storage at any point.

### 6. Verify service-worker security update behavior

The exact pre-#238 cached-worker upgrade is primarily a technical QA surface and is covered by the automated real-legacy fixture. For a manual smoke check:

1. Open DevTools → Application → Service Workers on the candidate preview.
2. Confirm the controlling worker is `/sw.js`.
3. Reload once and confirm the app reaches its normal ready state without a reload loop.
4. Inspect Cache Storage and confirm no credential-bearing `/api` request is present.

Do not attempt to manufacture an “old worker” by registering a synthetic script and treat that as equivalent to the automated fixture. The automated QA/CI uses the actual historical PWA build.

### 7. Verify API security headers

Using the exact preview origin, request a same-origin `/api` route that returns a controlled error, for example `/api/info` without an archive target.

Expected response headers include:

- `Strict-Transport-Security: max-age=31536000`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- the existing endpoint's no-store/cache behavior remains intact

Any missing required header or weakened cache policy is a failure.

### 8. Verify local/offline data remains usable

1. Create or open local project data that does not require an archive credential.
2. Switch the browser offline after the application is loaded.
3. Navigate local/offline content.

Expected:

- Credential hardening does not delete or encrypt local territorial/project data.
- Local shell/data remain usable subject to the app's existing offline behavior.
- Archive authentication remains fail-closed when a secure credential path is unavailable.

## Technical-only acceptance surfaces

The following are intentionally verified by automated tests rather than manual inspection because manual browser observation is not sufficiently reliable:

- stale 401 cannot clear a newer runtime credential or the wrong archive identity
- bounded/cycle-safe telemetry redaction and redaction-saturation fail-closed behavior
- immediate `AbortSignal` cancellation on invite expiry/unmount and rollback after sync cancellation
- cleanup timeout/marker ordering and cross-tab reset coordination
- current-worker security revision probe
- old cached PWA attempting a persisted bearer while the hardened server blocks upstream forwarding
- absence of credential-bearing requests in service-worker runtime caches

These technical checks are mandatory; they are not optional simply because they are not click-through QA.

## Known limitations / intentionally out of scope

- Offline territorial/project data is **not encrypted at rest** by issue #238. Follow-up #278 owns that work.
- Runtime archive credentials intentionally disappear on reload/tab restart; reconnecting is expected behavior, not a regression.
- The rollout guard protects requests after the hardened server boundary is deployed. It cannot retroactively undo credentials that an older deployment may have transmitted before that rollout.
- DevTools can inspect persistent stores but cannot prove absence from all ephemeral JavaScript memory. Automated boundary tests cover the persistence contract.
- This QA does not authorize weakening browser/security policy to make a legacy server easier to connect. HTTP remains an explicit-warning path.

## Cleanup / reset

1. Remove the disposable test archive from the app if desired.
2. Revoke/discard the disposable QA bearer token after testing.
3. Clear site data and unregister service workers if another QA run needs a pristine browser profile.
4. The automated helper removes its temporary legacy worktree on normal exit. If the process is force-killed, run `git worktree list` and `git worktree prune`; remove only the temporary `comapeo-qa-238.*` worktree if one remains.
5. Do not reset, clean, stash, or delete unrelated repository/user work as part of QA cleanup.

## QA result record

Record this in the PR/handoff:

- tested commit SHA:
- tester:
- date:
- `scripts/qa/238-browser-credential-hardening.sh`: PASS / FAIL
- real pre-hardening PWA rollout guard: PASS / FAIL
- Chromium credential boundary: PASS / FAIL
- Firefox credential boundary: PASS / FAIL
- WebKit credential boundary: PASS / FAIL
- encrypted invite sanitization: PASS / FAIL
- runtime-only persistence check: PASS / FAIL
- per-tab isolation: PASS / FAIL
- HTTP exact-URL approval: PASS / FAIL
- API security headers: PASS / FAIL
- human checklist overall: PASS / FAIL
- notes / defects found:

The implementation is ready for human QA only when the automated script passes (or exact-SHA CI supplies equivalent browser evidence for a documented host-library limitation), the applicable human checks above pass, and any discovered defects have been resolved through the normal PR cycle.
