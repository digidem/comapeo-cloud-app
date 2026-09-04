# CoMapeo Cloud App — Issue #337 implementation-ready spec

**Issue:** #337 — Have a sync button
**Base:** `origin/main` at `798846e092828a07a9169a1e0345ce8b15814532` (2026-09-04), inspected 2026-09-04
**Supersedes:** none
**Superseded-by:** none
**Status:** implementation-ready (single unit — one independently mergeable PR; no split required: no PR1/PR2 gate, one ownership boundary — UI wiring over the existing sync coordinator)
**Review:** Opus 5 round 1 (5 P1 + 5 P2 + 2 P3) + Opus 5 round 2 (1 new P1 + 3 P2 + 2 P3) + GLM 5.3 round 3 file-backed (3 new P2 + 8 P3; all 12 prior findings RESOLVED/verified-fixed). Every finding verified against source and applied to this head. Opus session limit hit before a round-4 fresh-eyes pass; round 3's residual findings are all applied — a confirming re-review of this exact head is owed before publication (Opus resets 1:50pm America/Sao_Paulo).

This spec is the canonical single source of truth for issue #337. Where the issue body and this file disagree, this file wins.

---

## Goal

Give users a visible, on-demand way to pull the latest data from their configured remote archives **without waiting for the 5-minute auto-sync poll** and **without clearing browser storage to force a re-login** (today's workaround named in the issue).

The sync engine already exists and is production-hardened (`syncArchive` coordinator: per-server lock/dedup, cancellation, security-startup gate, status in the auth store; auto-polled every 5 min while the tab is visible via `useAutoSync`). What is missing is **user-facing triggers**: two existing "Sync Now" affordances are dead no-ops, and a fully-implemented sync-all hook is wired to zero UI. This issue completes the wiring and adds one global trigger.

## Product model (DECIDED)

- **The coordinator is the single execution path.** Every new trigger calls the existing `syncRemoteArchive(serverId, { baseUrl, token })` (all-servers: `useSyncAll.sync()`, which maps over eligible servers). No new sync mechanism, no parallel lock, no direct `pull*` calls.
- **Auto-sync is unchanged.** `useAutoSync` (mounted once in `authenticated-layout.tsx` `AutoSyncWrapper`) keeps its mount sync + 5-min visible-tab poll. The manual trigger is a **supplement**, not a replacement; the coordinator's per-server `activeRuns` dedup makes manual + automatic invocations safe against double-run.
- **Trigger surfaces:**
  1. **Per-archive "Sync Now" — desktop `ArchiveBrowser` overflow sheet** (currently `// no-op for now` at `ArchiveBrowser.tsx:360-362`): wire to sync that one archive.
  2. **Per-archive "Sync Now" — mobile nav drawer overflow sheet** (currently `// no-op for now` at `mobile-nav-drawer.tsx:588-590`): wire to sync that one archive.
  3. **Global "Sync all" button (`SyncAllButton`)**: exactly **one** mounted instance, rendered by `authenticated-layout` into the `AppShell` topbar via a new `topbarPersistentActions` prop, **visible at all viewport widths** (mobile users reach it through the same topbar; the per-archive overflow sheet remains the mobile per-archive path). Not duplicated in the nav drawer — two mounted instances would each own independent `isRunningRef`/`isSyncing` state, breaking the disabled guard and double-firing toasts for one user intent.
- **Failure is visible, never silent.** Unlike `useAutoSync`/`useSyncAll` today (console.warn only), user-initiated syncs surface a toast outcome per the mapping table below. A per-archive trigger toasts that archive's outcome; the global button toasts one aggregate outcome.
- **No feedback fabrication.** A manual sync reports success only on real coordinator outcomes. The mapping is keyed on the actual `SyncResult` contract (`src/lib/sync.ts:35-42,65-73`): `success: boolean`, `status: 'ready' | 'partial' | 'error'`, `errorCode?: 'authorization' | 'connection' | 'credentials-required' | 'storage-cleanup-required' | 'worker-transition-required' | 'partial'`. There are no `'missing-server'` or `'startup-blocked'` status values — those coordinator results surface as `success: false` with an `error` string and/or one of the codes above.

### Outcome → toast mapping (normative)

Per-archive trigger (one server) and per-server results inside the global aggregate:

| Outcome condition | Toast | Copy intent |
| --- | --- | --- |
| `success && status === 'ready'` | `success` | "Synced" (+ archive name for per-archive) |
| `status === 'partial' \|\| errorCode === 'partial'` | `info` | "Some data synced — some resources failed; retry" (normative: `success` is `true` only when `status === 'ready'` — `src/lib/sync.ts:371` — so a literal `success && status === 'partial'` conjunction is unsatisfiable and would misroute partial results to the generic error toast) |
| `errorCode === 'authorization'` | `error` | "Session expired — sign in to this archive again" with a **toast action** (see Toast action support below) navigating to that archive's detail screen (settings/reconnect entry: `SELECT_SERVER` → `ArchiveServerDetail` edit/reconnect dialog) |
| `errorCode === 'credentials-required'` | `error` | "Token missing — reconnect this archive" with the same toast action target |
| `errorCode === 'connection'` | `error` | "Couldn't reach the archive — check connection" (retry = tap button again) |
| `errorCode === 'storage-cleanup-required'` | `info` | "Sync paused: storage cleanup needed — open Settings" (navigates to Settings) |
| `errorCode === 'worker-transition-required'` | `info` | "Sync paused: app update in progress — try again shortly" |
| thrown / no `errorCode` / `success: false` otherwise | `error` | "Sync failed" (generic fallback) |

Global button aggregate: all eligible results `ready` → `success`; mixed → the **worst** outcome present using full precedence (authorization/credentials-required errors first, then generic error, then `storage-cleanup-required` info, then `worker-transition-required` info, then partial info, else success), with count summary ("2 of 3 archives synced"); zero eligible → button hidden (below). Aggregate has its own title ids for the two lifecycle codes (`syncAll.toast.storageCleanupTitle` / `syncAll.toast.workerTransitionTitle`, i18n table below) so AC 6's "each `errorCode` has exactly one mapped toast message" holds at aggregate level too. **Deliberate downgrade, noted:** aggregate authorization/credentials failures collapse to the generic error toast **without** a Reconnect action (naming one archive when several failed would be arbitrary) — the copy directs the user to Home, where each archive's per-archive status and reconnect entry live. Per-archive triggers always carry the action.

### Toast action support (normative — new surface, owned by this issue)

`ToastData` (`src/components/ui/toast.tsx:16-22`) currently has **no** action affordance (the row renders only `ToastPrimitive.Close`). To make the recovery path real, this issue adds:

```ts
// ToastData gains:
action?: { label: string; onClick: () => void };
```

Rendered as `<ToastPrimitive.Action altText={label} onClick={action.onClick} className="…min-h-[44px] cursor-pointer…">` inside the toast row, alongside the existing `Close`. `addToast` passes it through unchanged. The action button must meet the 44px touch-target minimum and carry `altText` (a11y). **Action-bearing toasts override the default 5000 ms duration** (`toast.tsx:75`) with `duration: 10_000` — a "Reconnect" affordance that auto-dismisses in 5 s is untappable in practice. This is the **only** change to `src/components/ui/toast.tsx`; the outcome table's auth/credentials-required rows and the Settings navigation for `storage-cleanup-required` are implemented with it.

## Non-goals

- No changes to `src/lib/sync.ts`, `src/lib/reconciliation.ts`, `src/lib/sync-coordinator.ts`, `src/lib/remote-archive.ts` pull contracts, or the Dexie schema. No new fields on any DB row; no storage-reset surface is touched. (The one `src/components/ui/toast.tsx` change — the optional `action` field above — is an exception owned by this issue.)
- No changes to `useAutoSync` polling interval, visibility gating, or mount behavior.
- No per-project sync button, no progress UI (progress remains the existing per-server status in the auth store surfaced by Home), no "last synced" display changes.
- No background/continual syncing when the tab is hidden (explicitly out of scope; the issue asks for a manual trigger).
- No changes to `ArchiveServerDetail` / `ArchiveStatusCard` sync buttons or to `ArchiveOverflowSheet` itself (the sheet already closes on any action tap — `handleAction` — and gains no new props in this issue).
- No server (`comapeo-cloud`) changes.

## Product behavior / UX

1. **Desktop overflow sheet (`ArchiveBrowser` → `ArchiveOverflowSheet` → "Sync Now"):**
   - Selecting "Sync Now" closes the sheet (existing `handleAction` behavior — do not change it), resolves the server record by `overflowArchive.id` from `useAuthStore`, and calls `syncRemoteArchive(server.id, { baseUrl: server.baseUrl, token: server.token })` under the same guard as `HomeScreen.handleSync`: if `server.status === 'syncing'` or `!server.token`, the handler returns **without** issuing a call.
   - In-flight feedback comes from the **existing** per-archive store status (`status === 'syncing'` renders as "Syncing…" in Home/ArchiveStatusCard/detail) plus the completion toast. The sheet is already closed by then; no sheet state changes.
   - Outcome toast on completion per the mapping table, keyed to the archive name.
2. **Mobile nav drawer overflow sheet:** identical behavior, guard, and toast. The menu item keeps a **min 44px touch target** and `cursor-pointer` (project UI conventions).
3. **Global "Sync all" button (`SyncAllButton`):**
   - Renders icon + label with `aria-label`; `aria-busy` while syncing (a disabled button announces nothing).
   - Uses the extended `useSyncAll` (below); disabled + `aria-busy` while `isSyncing`. A second click while in flight is a no-op via the hook's `isRunningRef`; a concurrent auto-sync on the same server shares the coordinator's `activeRuns` promise (single execution).
   - Awaits `sync()`'s returned `SyncAllSummary` (below) and shows exactly **one** aggregate toast per the mapping table.
   - **Visibility:** hidden when `eligibleCount === 0` (nothing to sync — archives-only feature). Eligibility uses a **single exported predicate** (Ownership boundary) — the same one `sync()` uses internally. Before the first `hydrateServers()` resolves, the button renders hidden (no flash-in); an AC covers this.
   - **Unmount mid-sync:** the coordinator run is never cancelled by unmount. With topbar placement the button is mounted on every authenticated screen, so the realistic unmount case is full app unmount — then the outcome toast is simply not shown; no error is thrown and no stuck `isSyncing` state survives remount (state is hook-local and re-created fresh). If the authenticated layout itself unmounts without app teardown (e.g. logout mid-sync), the awaited closure still runs and `addToast` targets the root-level provider (`src/app/providers.tsx:22`) which survives — the toast still appears; this is acceptable and requires no mounted-ref guard. Related mobile note: at 375 px width the topbar is tight; the button may render icon-only below the `sm` breakpoint.
4. **Toast plumbing (DECIDED, replaces any hedge):** the app toast system exists — `ToastProvider` is mounted in `src/app/providers.tsx:22` and in `tests/mocks/test-utils.tsx`; use `const { addToast } = useToast()` with `{ variant, title, description?, action?, duration? }`. Variants are `'success' | 'error' | 'info'` only — there is no `warning`; "partial" outcomes use `info`. Outcome announcement is handled by the toast's existing `role="status"` (`src/components/ui/toast.tsx:80`); do not add a second live region.

### Placement (DECIDED, revised after review)

- `AppShell` (`src/components/layout/app-shell.tsx`) gains one optional presentational prop: `topbarPersistentActions?: ReactNode`, rendered inside the `Topbar` children area next to the per-screen `{topbarActions}` slot (which per-screen `useShellSlot` overrides fully replace — hence this separate persistent channel). `AppShell` itself stays strictly presentational: it renders the prop, it does not import stores, hooks, or the data layer. When both action slots are nullish, `Topbar` receives no children and renders **no divider** (`topbar.tsx` renders the `h-4 w-px` divider only when children are truthy). **Implementation trap:** `AppShell` must pass a **single guarded expression** to `Topbar` (e.g. `children = topbarActions ?? topbarPersistentActions ? <>{topbarActions}{topbarPersistentActions}</> : undefined`) — passing both as adjacent JSX children always produces a truthy array and defeats the divider guard even when both are undefined. AC 3 asserts the divider-absent case.
- `src/components/layout/authenticated-layout.tsx` (already owner of `AutoSyncWrapper`, lines 399-402) passes `topbarPersistentActions={eligibleCount > 0 ? <SyncAllButton /> : undefined}` — the visibility decision lives **here**, not inside the button, so a hidden button never leaves a truthy element that would render the topbar divider on screens that today have none.
- The button renders at **all viewport widths** (the Topbar already renders its children at all widths — `topbar.tsx:66-73`); no separate mobile instance exists.

## Current-code constraints (verified at base SHA)

- `src/hooks/useSyncAll.ts`: filters `useAuthStore.servers` to credentialed non-cancelled (`baseUrl && token && onboardingStatus !== 'cancelled'`), `Promise.allSettled` over `syncRemoteArchive`, `isRunningRef` re-entrancy guard, `isSyncing` state; **no UI consumer anywhere**; outcomes only `console.warn`ed; the outer `catch {}` and zero-eligible early return both return `undefined` — the hook currently gives the caller no outcome data.
- `src/hooks/useAutoSync.ts`: mount sync + 5-min interval, visibility-gated; mounted via `AutoSyncWrapper` in `src/components/layout/authenticated-layout.tsx:399-402`.
- `src/lib/data-layer.ts:456-462`: `syncRemoteArchive(serverId, options?, control?)` is a thin passthrough to `syncArchive` (`src/lib/sync-coordinator.ts:154`), which handles the security-startup gate, per-server `activeRuns` dedup (concurrent callers share one promise), cancellation pollers, and resolves server config from the auth store when `options` is omitted. Returns `SyncResult`.
- `src/lib/sync.ts:35-42`: `SyncStatus = 'ready' | 'partial' | 'error'`; `SyncErrorCode = 'authorization' | 'connection' | 'credentials-required' | 'storage-cleanup-required' | 'worker-transition-required' | 'partial'` (normative contract for the toast mapping).
- `src/screens/Home/HomeScreen.tsx:648-661`: `handleSync(serverId)` is the working per-archive trigger pattern (guard + `syncRemoteArchive` + `.catch` swallow); wired to `ArchiveServerDetail` (Sync Now / Retry Sync) and `ArchiveStatusCard` (Retry Sync).
- **Dead no-op #1:** `src/screens/Home/ArchiveBrowser.tsx:360-362` — `onSync={() => { /* no-op for now */ }}`.
- **Dead no-op #2:** `src/components/layout/mobile-nav-drawer.tsx:588-590` — same.
- `src/components/shared/ArchiveOverflowSheet.tsx`: sheet already has the "Sync Now" item, `archiveOverflow.syncNow` i18n id, and **closes itself on any action tap** (`handleAction`, lines 64-67); no per-item disabled support and none is added.
- `src/components/layout/app-shell.tsx:87` renders `{topbarActions}`; `src/components/layout/topbar.tsx:66-73` renders children at all widths; `src/components/layout/shell-slot.tsx` overrides are per-screen and fully replaced on each screen mount — hence the new persistent prop channel.
- `src/components/ui/toast.tsx`: `ToastVariant = 'success' | 'error' | 'info'` (line 14), `ToastData = { id, variant, title, description?, duration? }` (lines 16-22) with **no** action field today, `addToast({ variant, title, description? })`, toast row has `role="status"` (line 80) and renders only `ToastPrimitive.Close`; `useToast` throws outside a provider (line 45).
- `useAuthStore` (`src/stores/auth-store.ts`) exposes `servers: RemoteArchiveServer[]` with `id, label, baseUrl, token, status ('idle'|'syncing'|…), onboardingStatus, lastSyncedAt`; `hydrateServers()` re-reads IndexedDB.
- i18n: `src/i18n/messages/{en,pt,es}.json`; regenerate with `npm run extract-messages`.
- Existing tests to extend: `tests/unit/hooks/useSyncAll.test.tsx`; `tests/unit/screens/Home/ArchiveBrowser.test.tsx` exists but currently contains **no** Sync Now / no-op assertion — the "dead no-op → real guarded call" test in AC 11 is new work in that file, not an update; plus mobile-nav-drawer, `AppShell`, and `authenticated-layout` unit tests where present; coordinator dedup is already covered by `tests/unit/lib/sync-coordinator.test.ts` against the real coordinator with mocked transport.

## Ownership boundary (DECIDED, revised after review)

- **One component change (UI primitive):** `src/components/ui/toast.tsx` gains the optional `action?: { label: string; onClick: () => void }` field on `ToastData`, rendered as `ToastPrimitive.Action` (see Toast action support). No other toast behavior changes.
- **One new component:** `src/components/shared/SyncAllButton.tsx` — global-trigger UI + aggregate toast mapping. Named export, `function` declaration.
- **One hook change:** `useSyncAll` changes `sync` to return a summary instead of `void`:
  ```ts
  interface SyncAllServerResult { serverId: string; label: string; success: boolean; status: SyncStatus; errorCode?: SyncErrorCode; }
  interface SyncAllSummary { total: number; results: SyncAllServerResult[]; }
  sync(): Promise<SyncAllSummary>   // returned on EVERY path
  ```
  Normative result normalization: a fulfilled `syncRemoteArchive` maps `SyncResult` fields through verbatim; a **rejected** promise (or the outer catch) maps to `{ serverId, label, success: false, status: 'error' }` with `errorCode` omitted; zero-eligible returns `{ total: 0, results: [] }`; on the catch path `total` = eligible-server count. **Re-entrant call** (`isRunningRef.current` already `true`): resolves `{ total: 0, results: [] }` and toasts **nothing** — `SyncAllButton`'s handler guards on `isSyncing` before calling `sync()`, so the re-entry path is unreachable from the button and must not produce a "0 of 0" toast.
  `isSyncing` state and `isRunningRef` are unchanged. There is **no `lastResult` state** — the caller awaits the promise and toasts, avoiding StrictMode double-invoke/remount toast replay and stale-state classification. (Note: `useState`-returning hooks fire toasts in effects unreliably under StrictMode; promise-return is the fix.)
- **One exported predicate:** `selectSyncableServers(state)` exported from `src/stores/auth-store.ts` (or re-exported from `useSyncAll`) implementing exactly `baseUrl && token && onboardingStatus !== 'cancelled'`. `useSyncAll` consumes it for `sync()`; `SyncAllButton`/`authenticated-layout` consume it (via an `eligibleCount` selector) for visibility. No call site **introduced by this issue** re-derives eligibility inline. (`useAutoSync`'s pre-existing identical inline filter is intentionally left untouched per Non-goals; optionally, a behavior-neutral follow-up may migrate it to the predicate.)
- **One new shared hook:** `src/hooks/useArchiveSyncTrigger.ts` — `useArchiveSyncTrigger()` returns `sync(serverId: string): Promise<void>` and **owns the entire per-archive trigger path**: server resolution by id from the auth store, the guard (`status === 'syncing' || !token` → no-op), the `syncRemoteArchive` call, the per-outcome toast mapping (Outcome table, including toast actions and navigation). Both wiring sites (`ArchiveBrowser`, `mobile-nav-drawer`) consume it; neither re-implements the mapping. Tests cover the hook once plus thin wiring assertions per site. The drawer site keeps its props-callback pattern working: the drawer may receive `onDrawerSyncServer` injected from `authenticated-layout` (mirroring `onDrawerArchiveSettings`) with the hook used at the layout level — implementer's choice, but the mapping itself is written exactly once.
- **Two wiring changes:** the two dead `onSync` handlers get real implementations by consuming `useArchiveSyncTrigger`. Per-archive wiring does **not** go through `useSyncAll`. Per-archive sync-state display reuses the server's `status` from the store; no new status plumbing. **Constraint:** `mobile-nav-drawer.tsx` is props-driven and currently imports no store/data-layer modules; if the drawer handler ends up calling `useToast()` (direct hook consumption instead of prop injection), `src/components/layout/mobile-nav-drawer.stories.tsx` (exists) must gain a `ToastProvider` decorator or the story throws (`useToast` throws outside a provider — `toast.tsx:45`); with prop injection no decorator is needed.
- **One prop + one render change:** `AppShell` gains `topbarPersistentActions`; `authenticated-layout` passes `<SyncAllButton />` when `eligibleCount > 0`, else `undefined`. `ArchiveOverflowSheet` and `Topbar` are **not** modified.
- Canonical per-server pattern remains `HomeScreen.handleSync`; canonical all-servers pattern remains `useSyncAll`.

## i18n ids (DECIDED — exact)

New ids (en source strings; pt/es translations required for all):

| id | en defaultMessage |
| --- | --- |
| `syncAll.button.label` | `Sync all` |
| `syncAll.button.ariaLabel` | `Sync all archives now` |
| `syncAll.button.syncing` | `Syncing…` |
| `syncAll.toast.successTitle` | `All archives synced` |
| `syncAll.toast.partialTitle` | `Some data synced` |
| `syncAll.toast.partialDescription` | `{synced} of {total} archives synced. Some resources failed — try again.` |
| `syncAll.toast.errorTitle` | `Sync failed` |
| `syncAll.toast.errorDescription` | `{synced} of {total} archives synced. Check the archives listed in Home.` |
| `syncAll.toast.storageCleanupTitle` | `Sync paused: storage cleanup needed` |
| `syncAll.toast.workerTransitionTitle` | `Sync paused: app update in progress` |
| `archive.sync.toast.reconnectAction` | `Reconnect` (toast action label for auth/credentials toasts; 44px target, `altText` = label) |
| `sync.toast.openSettingsAction` | `Open Settings` (shared toast action label for the storage-cleanup toasts — per-archive **and** aggregate lifecycle toasts carry this action navigating to Settings; 44px target, `altText` = label) |
| `archive.sync.toast.successTitle` | `Archive synced` (description: `{name}`) |
| `archive.sync.toast.partialTitle` | `Some data synced for {name}` |
| `archive.sync.toast.errorTitle` | `Couldn't sync {name}` |
| `archive.sync.toast.authRequired` | `Session expired — reconnect {name} to continue` |
| `archive.sync.toast.credentialsRequired` | `Token missing — reconnect {name}` |
| `archive.sync.toast.connectionError` | `Couldn't reach {name} — check your connection` |
| `archive.sync.toast.storageCleanupRequired` | `Sync paused: storage cleanup needed for {name}` |
| `archive.sync.toast.workerTransitionRequired` | `Sync paused: app update in progress — try again shortly` |

The per-archive auth/credentials toast includes an action (tap → archive detail/reconnect). Reuse `archiveOverflow.syncNow` for the menu item (exists). `npm run extract-messages` must run clean; all ids land in en, pt, es.

## Acceptance criteria

1. Desktop: tapping an archive's "Sync Now" in the `ArchiveBrowser` overflow sheet closes the sheet and triggers exactly one `syncRemoteArchive` call for that server id; the handler issues **zero** calls when that server's `status === 'syncing'` or token is absent.
2. Mobile: same behavior from the nav-drawer overflow sheet; the menu item meets the 44px touch-target minimum.
3. One global `SyncAllButton` is rendered in the topbar via `topbarPersistentActions` on every authenticated screen, at all viewport widths, whenever `eligibleCount > 0`; when zero eligible servers exist **and** the screen supplies no `topbarActions`, no button and no topbar divider render. Hydration transition: with servers `[]` and `hydrateServers()` pending, no button renders; after hydration resolves with one credentialed server, the button appears (asserted as a transition, not just a static first-paint check).
4. Clicking the global button issues exactly one `syncRemoteArchive` call per eligible server (mocked data-layer counts calls); a second click while `isSyncing` yields no additional invocations.
5. Concurrency: a manual trigger issued while `server.status === 'syncing'` issues zero additional `syncRemoteArchive` calls for that server (UI-level test). Coordinator-level single-execution dedup (`activeRuns`) is **not** re-tested here — it is owned by the existing `tests/unit/lib/sync-coordinator.test.ts` against the real coordinator; this spec references, not duplicates, that coverage.
6. Outcomes: toasts render per the Outcome → toast mapping, including the `partial` → `info` case and per-code copy; no toast is shown for auto-sync-triggered runs (auto-sync behavior untouched). Each `errorCode` in `SyncErrorCode` has exactly one mapped toast message, at per-archive **and** aggregate level (the two lifecycle codes have aggregate titles per the i18n table).
7. The auth/credentials-required toast renders a `ToastPrimitive.Action` (label `archive.sync.toast.reconnectAction`) meeting the 44px target with `altText`; tapping it navigates to the archive detail/reconnect surface (asserted).
8. `useSyncAll().sync()` returns a `SyncAllSummary` on every path — asserted by unit tests covering: all-ready, per-server rejection (normalized `status: 'error'`, no `errorCode`), outer throw, zero-eligible (`{ total: 0, results: [] }`), and the re-entrant call while in flight (`{ total: 0, results: [] }`, no toast).
9. Unmount mid-sync: unmounting the button (or the whole layout) while a sync is in flight throws nothing, cancels nothing, and a remount renders a fresh, enabled button.
10. New i18n ids from the table above exist in en, pt, and es; `npm run extract-messages` runs clean.
11. Unit tests: `useArchiveSyncTrigger` (the shared per-archive mapping — guard, call, toast per code, actions, navigation — tested once here), `useSyncAll` (new summary return + normalization + re-entry), `SyncAllButton` (visibility/eligibility, disabled+`aria-busy`, aggregate toast mapping), `AppShell` (renders `topbarPersistentActions` while staying presentational, single guarded expression — no divider when both slots undefined), and the toast `action` render (44px target, `altText`, onClick fires, 10 s duration); plus thin wiring assertions in `ArchiveBrowser` (dead no-op → hook call; new test, the file has no no-op assertion today) and the nav drawer. All with MSW or mocked data-layer per existing test conventions. If the drawer consumes `useToast` directly, `src/components/layout/mobile-nav-drawer.stories.tsx` gains a `ToastProvider` decorator; with prop injection (`onDrawerSyncServer`) no change is needed.
12. `npm test` green with ≥80% coverage on all touched files (project Husky gate enforces this at push).

## Risks / notes

- AppShell topbar change can shift visual-regression baselines; run `npm run test:screenshots` and review Argos diffs before pushing.
- The two overflow sheets carry the archive id but not necessarily the token; resolution via `useAuthStore` by id (not from sheet props) is mandatory — sheet props are display-shaped and may be stale.
- `worker-transition-required` / `storage-cleanup-required` gate on the storage-reset lifecycle; their toasts are informational and must not imply user error.
