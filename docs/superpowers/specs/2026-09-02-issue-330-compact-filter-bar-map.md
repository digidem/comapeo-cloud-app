# CoMapeo Cloud App — Issue #330 implementation-ready spec

**Issue:** #330 — feat(data): compact single-line filter bar for desktop map view; category selection moves to temporary side sheet
**Base:** `origin/main` at `f94d00e79eeb5cb2ebcdaf217fd64164d4320934` (2026-09-01), inspected 2026-09-02
**Supersedes:** none
**Superseded-by:** none
**Status:** implementation-ready (single unit — one independently mergeable PR; no split required: no PR1/PR2 gate, one ownership boundary, one coherent reviewable objective)

This spec is the canonical single source of truth for issue #330. Where the issue body and this file disagree, this file wins.

---

## Goal

On the **desktop map view** (`viewMode === 'map'` in `src/screens/DataScreen.tsx`), replace the large floating filter panel in the `topLeft` slot of `MapScreenLayout` with a **single compact line**:

`[ Filters (n) ] [Category: X ✕] [From: 2026-01-01 ✕] [To: 2026-02-01 ✕] · 12 results`

- The **Filters** button carries an **active-filter-count badge** (see Badge semantics below) and opens the existing `FilterSheet` rendered as a **right-side drawer** on desktop (currently a bottom sheet only).
- Active filters render inline as **dismissible chips**; each chip's `✕` clears that filter directly via the existing `useObservationFilters` setters — no sheet round-trip.
- Result count stays visible on the line (existing `data.filters.resultCount` message).
- **Clear-all stays inside the sheet** (`obsFilters.reset`), not on the line.

## Non-goals

- No changes to the **desktop grid view** filter bar (DataScreen lines 594-608 keep the full `ObservationFilterBar`).
- No changes to **any mobile behavior** — mobile map (bottomLeft Filters button + bottom-sheet `FilterSheet`, lines 381-431) and mobile grid (lines 543-591) behave exactly as today. (The mobile map's `FilterSheet` JSX instance is unified into the single JS-gated instance — same bottom-sheet rendering, same behavior.)
- No changes to `useObservationFilters` hook logic, `filterObservations`, or `lib/observation-filters.ts`.
- No new filter dimensions (only surface search / date range / categories differently).
- No changes to `MapScreenLayout` slot mechanics.
- No visual redesign beyond the compact line and drawer positioning; follow existing design tokens (`DESIGN_OVERVIEW.md`).
- No sort control on the map view (unchanged: `showSort={false}`).

## Product behavior / UX

### Desktop map view (≥ md breakpoint, 768px, matching the JS gate `useMediaQuery('(min-width: 768px)')` — NOT the `lg` breakpoint used by `useIsDesktop`)

The `topLeft` slot renders one compact line in a `bg-surface-card` pill/row with `shadow-card`:

1. **Filters button** — same visual language as the mobile Filters button (funnel icon + `data.filterButton` label). Badge shows the **active filter dimension count** (see below). Opens the desktop drawer.
2. **Active-filter chips** (only while `obsFilters.isFiltering`):
   - One chip per active filter: search (`Search: term ✕`), start date (`From: 2026-01-01 ✕`), end date (`To: 2026-02-01 ✕`), and **one chip per selected category** (`Category: X ✕`). Dismissing a chip calls the matching existing setter immediately: search → `setSearch('')`; start date → `setStartDate(null)`; end date → `setEndDate(null)`; category chip X → `toggleCategory(X)` (normative — the single canonical toggle; do not use `setCategories(filter(...))`). **Date chips render the raw ISO `YYYY-MM-DD` string** (locale-neutral and deterministic to assert); no `intl.formatDate` on chips.
   - Chip `✕` buttons keep `min-h-[44px]`/adequate touch targets per repo convention (this makes the bar ~52px tall — accepted) and an accessible name (`data.filters.removeFilter` message, e.g. "Remove filter: {label}"). `topLeftPositionClassName` stays `top-[4.25rem] left-3 right-20` (still clears the basemap switcher at `top-[4.25rem] right-3`); no 44px relaxation for this pointer-first surface.
3. **Result count** — right-aligned on the same line, existing `data.filters.resultCount` plural message.

**Chip overflow (narrow desktop widths):** the line must remain a **single line**. The chip row gets `overflow-x-auto` (horizontal scroll) with `flex-nowrap`; the Filters button and result count are pinned (non-scrolling). Do NOT wrap to multiple lines and do NOT truncate chips with "+N" — horizontal scroll keeps every chip reachable and is deterministic to test (assert `flex-nowrap`/`overflow-x-auto` classes and no wrap). The scroll container gets `tabIndex={0}` and `aria-label` so keyboard users can scroll it.

### Filters drawer (desktop)

Clicking **Filters** opens `FilterSheet` as a **right-side drawer**: `Dialog.Content` positioned `fixed right-0 top-0 bottom-0`, width `w-[min(380px,90vw)]`, full height (drop `max-h-[85vh]` and `rounded-t-card` in the right variant), slide-in-from-right animation (add a `slideInRight` keyframe alongside the existing `slideUp`/`fadeIn` in `src/app/styles.css`; expose it as a Tailwind animate utility like the existing `--animate-*` tokens, since the current animation is an inline style that cannot vary responsively; do not fork the component into a second Dialog). The drawer contains, in order: header (title + `Dialog.Close` ✕), category selection (the existing `CategoryFilterSheet` nested trigger row, as today), search input, From/To date inputs, result count — i.e. exactly the current sheet contents, repositioned. `showSort={false}` unchanged.

- Drawer closes on **Apply** ("Show results" button), **ESC**, and **outside-click** — all already provided by Radix `Dialog.Root`/`DismissableLayer`; do not re-implement.
- **Single `FilterSheet` instance, JS-gated variant.** DataScreen renders exactly ONE `FilterSheet` in the map branch (portaled Radix content escapes `hidden md:block` wrappers, so CSS-hiding a duplicate is not viable — two portals would render at every viewport). The mobile `bottomLeft` `FilterSheet` and its wrapper are **removed**; one instance, positioned in the JSX where the mobile button is today, receives `variant={isDrawerDesktop ? 'right' : 'bottom'}` where `isDrawerDesktop = useMediaQuery('(min-width: 768px)')`. The mobile Filters button stays in `md:hidden` as-is; only the sheet instance is unified. No JS/CSS breakpoint drift: both gates use the same 768px md value, asserted in tests.
- The existing `SelectPortalProvider` portal-container pattern (FilterSheet lines 55-57, 115-117, 147-149) is retained so Select clicks aren't intercepted by the DismissableLayer.

### Mobile (unchanged) and grid view (unchanged)

- Mobile map: Filters button in `bottomLeft` (`md:hidden`) with `filteredObs.length` badge — **unchanged**, including its badge semantics (result count). This is intentionally different from the desktop line's dimension-count badge; do not "unify" them in this PR.
- Grid view desktop: full `ObservationFilterBar` (lines 594-608) — unchanged.

### Badge semantics (DECIDED — resolves issue ambiguity)

The desktop Filters-button badge = **number of active filter dimensions**, not the result count:

- search (1 if `filters.search !== DEFAULT_FILTERS.search` — import the same `DEFAULT_FILTERS` constant `useObservationFilters` uses so the two never drift), startDate (1 if non-null), endDate (1 if non-null), categories (**1 if `filters.categories.length > 0`**, regardless of how many categories are selected).
- Max value 4. Rationale: the badge answers "how many kinds of filter are on?" (what Clear-all will change), and it never shows a misleading number when filters match everything (e.g. 500 results with one date filter). Category count is surfaced by the chips themselves. Result count is already on the line.
- Badge renders only when `obsFilters.isFiltering` is true (count ≥ 1 by definition then). Use the same badge styling as the mobile pattern (`h-4 min-w-[16px] rounded-full bg-primary px-1 text-[10px] font-bold text-white`).

## Current-code constraints (verified at base SHA)

- `src/screens/DataScreen.tsx` lines 304-465: map view branch. `topLeft` block lines 336-354 wraps `ObservationFilterBar` in `hidden w-full md:block` with `topLeftPositionClassName="top-[4.25rem] left-3 right-20 items-start"` (line 334). Mobile Filters button + `FilterSheet` in `bottomLeft` lines 381-431 (state `filterDrawerOpen`, line 125).
- `src/components/shared/ObservationFilterBar.tsx`: named export `ObservationFilterBar` + `ObservationFilterBarProps` (lines 55-72). Props already include `hideCategories` and `showSort` (lines 67-70) — `hideCategories` is currently used only by `FilterSheet` (FilterSheet line 148), never from DataScreen. Layout is `flex-col sm:flex-row sm:flex-wrap` (line 100) — **wraps by design; unsuitable for a single-line bar without mode changes**.
- `src/components/shared/FilterSheet.tsx`: named exports `FilterSheet` + `FilterSheetProps` (lines 164-165). `FilterSheetProps extends ObservationFilterBarProps` adding `open`, `onOpenChange`, `onCategoriesSelectAll`, `categoriesLoading` (lines 40-45). Radix `Dialog.Content` is hard-coded as a bottom sheet (`fixed bottom-0 left-0 right-0 max-h-[85vh]`, line 84) with `slideUp` animation.
- `src/components/shared/MapScreenLayout/MapScreenLayout.tsx`: slots `topLeft`/`topRight`/`bottomLeft`/`bottomRight` are absolutely positioned divs (lines 42-72); `topLeftPositionClassName` overrides default. No changes needed here.
- `src/hooks/useObservationFilters.ts`: the filter state owner — `setSearch`, `setStartDate`, `setEndDate`, `toggleCategory`, `setCategories`, `setSort`, `reset`, `isFiltering` (lines 13-25). `isFiltering` excludes sort (lines 94-101). **This hook is NOT modified.**
- `src/hooks/useIsDesktop.ts` uses **lg (1024px)** — do not use it for this feature; the map-view desktop surface is `md`-scoped (768px) and stays `md`-scoped.
- A **new hook `src/hooks/useMediaQuery.ts`** (`export function useMediaQuery(query: string): boolean`, named export, function declaration, `window.matchMedia` + `change` listener, SSR-safe `false` default) gates the desktop/mobile drawer variant. Unit tests mock this hook (or `window.matchMedia`) — jsdom ignores media queries and renders both breakpoint trees, so "mocking the viewport" is not a viable strategy.
- i18n: messages live in `src/i18n/messages/{en,pt,es}.json`; extraction via `npm run extract-messages`; CI runs an i18n completeness check.
- Existing animations: `slideUp`/`fadeIn` keyframes in `src/app/styles.css` (lines 242, 251).

## Ownership boundary and exported symbols (DECIDED)

**New component — `src/components/shared/CompactObservationFilterBar.tsx`** (a compact *variant*, not a mode on `ObservationFilterBar`):

- Why: `ObservationFilterBar`'s contract is the multi-control wrapped bar used by grid view and the sheet body; a `compact` mode would make one component own two unrelated layouts and force grid-view tests to regress-guard a mode they never use. A separate component consumes the same hook outputs and reuses `ObservationFilterBarProps`-shaped callbacks where sensible.
- Exports: `export function CompactObservationFilterBar(props: CompactObservationFilterBarProps)` and `export type { CompactObservationFilterBarProps }` (named exports, function declaration, per conventions).
- `CompactObservationFilterBarProps`:

  ```ts
  import type { ObservationFilters } from '@/lib/observation-filters';

  export interface CompactObservationFilterBarProps {
    className?: string;
    filters: ObservationFilters;
    resultCount: number;
    isFiltering: boolean;
    /** Active filter dimension count (0-4) for the Filters button badge. */
    activeFilterCount: number;
    onOpenFilters: () => void;
    onSearchClear: () => void;
    onStartDateClear: () => void;
    onEndDateClear: () => void;
    /** Remove a single selected category by name. */
    onCategoryRemove: (category: string) => void;
  }
  ```

  The component is **presentational**: it renders button/badge/chips/count and calls the callbacks; DataScreen wires them to `obsFilters` setters. It does not import the hook. (Alternatively the count could be computed inside from `filters`; keeping it a prop keeps the component pure and the badge rule testable at the wiring level — either is acceptable, but the prop form is the specified contract.)
- It does NOT render the `FilterSheet` itself; DataScreen keeps owning `filterDrawerOpen` state and renders `FilterSheet` beside it (same pattern as mobile, lines 411-430).

**`FilterSheet` desktop drawer variant — modify `src/components/shared/FilterSheet.tsx`:**

- Keep the exact named exports `FilterSheet` / `FilterSheetProps` (no new export needed). Add an optional prop `variant?: 'bottom' | 'right'` **defaulting to `'bottom'`**; existing call sites are unaffected. When `variant === 'right'`, `Dialog.Content` uses right-edge positioning classes and the `slideInRight` animation; drag handle hidden on the right variant; contents/order unchanged.
- Rendered from DataScreen map view as ONE `<FilterSheet variant={isDrawerDesktop ? 'right' : 'bottom'} ... />` (see Wiring); `useMediaQuery` decides the variant at render time.
- Mobile grid-view call site (lines 572-590) untouched.

**Wiring — `src/screens/DataScreen.tsx` map-view branch only (lines 332-465):**

- Replace the `topLeft` `ObservationFilterBar` block (lines 336-354) with `CompactObservationFilterBar` inside the existing `hidden w-full md:block` wrapper; keep `topLeftPositionClassName` as `top-[4.25rem] left-3 right-20` (clears the basemap switcher).
- Remove the mobile `bottomLeft` `FilterSheet` instance; render ONE `FilterSheet` (at the mobile instance's JSX position) with `variant={isDrawerDesktop ? 'right' : 'bottom'}` sharing the existing `filterDrawerOpen` state (lines 411-430 pattern, unified).
- `isDrawerDesktop` from new `useMediaQuery('(min-width: 768px)')`.
- `activeFilterCount` computed in DataScreen from `obsFilters.filters` per the Badge semantics formula (using `DEFAULT_FILTERS`).

## Key implementation files

| File | Change |
|---|---|
| `src/hooks/useMediaQuery.ts` | NEW — `useMediaQuery('(min-width: 768px)')` gates drawer variant |
| `src/components/shared/CompactObservationFilterBar.tsx` | NEW — compact line component |
| `src/components/shared/FilterSheet.tsx` | add `variant?: 'bottom' \| 'right'` prop; right-drawer positioning + animation; hide drag handle in right variant |
| `src/app/styles.css` | add `slideInRight` keyframe (and `fadeIn` reuse) |
| `src/screens/DataScreen.tsx` | map-view `topLeft`: swap in `CompactObservationFilterBar`; unify to ONE `FilterSheet` with `variant` from `useMediaQuery`; compute `activeFilterCount`; remove mobile duplicate sheet |
| `src/i18n/messages/en.json`, `pt.json`, `es.json` | new message IDs via `npm run extract-messages` |
| `tests/unit/hooks/useMediaQuery.test.ts` | NEW — matchMedia mock: match/no-match/change/unmount |
| `tests/unit/components/shared/CompactObservationFilterBar.test.tsx` | NEW |
| `tests/unit/components/shared/FilterSheet.test.tsx` | extend for `variant="right"` |
| `tests/unit/screens/DataScreen.test.tsx` (or existing DataScreen test location) | desktop map-view rendering, wiring, unchanged grid/mobile |

New i18n message IDs (en defaultMessages; pt/es translated):

- `data.filters.activeFilterCount` — "{count, plural, one {# active filter} other {# active filters}}" (badge accessible label; visible badge can be the bare number like mobile)
- `data.filters.removeFilter` — "Remove filter: {label}"
- `data.filters.searchChip` — "Search: {value}"
- `data.filters.fromDateChip` — "From: {date}"
- `data.filters.toDateChip` — "To: {date}"
- `data.filters.categoryChip` — "Category: {name}"
- `data.filters.chipRow` — "Active filters" (scroll container aria-label)

## Security / privacy / offline / failure behavior

No new data paths; purely presentational over existing in-memory filters. No persistence changes (no storage-reset invariants triggered). Drawer/overlay z-index must stay ≤ the existing z-50/z-[51] pattern so no map control is permanently occluded.

## Acceptance criteria (deterministic)

1. Desktop map view (viewport ≥ 768px): `topLeft` renders exactly one compact line — Filters button with badge (when filtering), inline chips, result count; no search/date/category inputs visible outside the drawer. `ObservationFilterBar` does not render in the `topLeft` slot (it still renders inside the open drawer, as today).
2. Category selection UI is only reachable inside the drawer (via the `CategoryFilterSheet` trigger row); none on the line.
3. Drawer closes on Apply button, ESC key, and outside-click (pointer-down on overlay).
4. Each active filter renders a dismissible chip; clicking its `✕` calls the corresponding setter and the chip disappears immediately without opening the sheet (e.g. date chip → `setStartDate(null)`).
5. Badge = active filter dimension count (0 hidden; max 4; categories = 1 dimension), rendered only when `isFiltering`.
6. Chip row never wraps: `overflow-x-auto` + nowrap; Filters button and result count always visible without scrolling.
7. Grid view desktop: full `ObservationFilterBar` renders exactly as before (snapshot/behavior test unchanged and passing).
8. Exactly one `FilterSheet` mounted in the map branch at any viewport; variant per `useMediaQuery('(min-width: 768px)')` (right ≥768px, bottom <768px); mobile sheet behavior identical to current main; mobile badge still shows `filteredObs.length`.
9. All user-facing strings via react-intl `defineMessages`; `en`/`pt`/`es` all carry every new ID; `npm run extract-messages` produces no diff beyond the new keys; i18n CI check green.
10. Unit tests added/updated per the list below; `npm run test:coverage` ≥ 80% lines/functions/branches/statements for all touched files.
11. `npm run lint:types`, `npm run lint:eslint`, `npm run lint:prettier` all clean.

## Required tests

`tests/unit/hooks/useMediaQuery.test.ts` (NEW):

- returns false when `window.matchMedia` reports no match; true on match; subscribes and updates on `change` events; cleans up the listener on unmount
- default matchMedia jsdom mock pattern per existing hook tests in this repo

`tests/unit/components/shared/CompactObservationFilterBar.test.tsx` (NEW):

- renders Filters button, badge iff `isFiltering && activeFilterCount > 0`, badge shows `activeFilterCount`
- renders one chip per active search/start/end/category (categories → one chip each) and none when not filtering
- chip dismiss calls the right callback with the right argument (search/`''`→`onSearchClear`, dates→ respective clear, category→`onCategoryRemove('X')`)
- chip `✕` has accessible name from `data.filters.removeFilter`
- chip row has nowrap + `overflow-x-auto` and a scrollable aria-labelled container
- result count text via plural message

`tests/unit/components/shared/FilterSheet.test.tsx` (EXTEND):

- default (no variant) renders bottom-sheet positioning — existing tests keep passing unchanged
- `variant="right"` renders right-edge fixed positioning; drag handle absent; Apply closes; ESC closes; outside-click closes; nested `CategoryFilterSheet` still opens/closes
- `SelectPortalProvider` portal still renders inside `Dialog.Content` in right variant

`tests/unit/screens/DataScreen.test.tsx` (EXTEND, map view cases; **strategy:** jsdom ignores media queries and Radix portals escape wrappers — do NOT "mock the viewport". Mock `useMediaQuery` (or `window.matchMedia`) at the module boundary: desktop cases = matchMedia true, mobile cases = false. Scope dialog queries with `within()`; expect two "Clear filters" buttons when both grid+sheet render, matching the existing suite's workaround at `DataScreen.test.tsx:744`):

- map view (matchMedia true) shows `CompactObservationFilterBar` and NOT `ObservationFilterBar`'s search input
- Filters button opens drawer (variant `right` when matchMedia true, `bottom` when false); Apply/ESC/outside-click closes
- exactly one `FilterSheet`/dialog mounted per render at either mock value
- dismissing a category chip removes exactly that category from `obsFilters.filters.categories`
- `activeFilterCount` matches the badge formula (e.g. search + 2 categories → 3)
- grid view desktop still renders full `ObservationFilterBar` with category multi-select inline
- mobile map (matchMedia false): Filters button + bottom sheet, badge = result count — unchanged

## TDD order (mandatory)

1. RED: `CompactObservationFilterBar.test.tsx` — renders button/badge/chips/count; fails (component doesn't exist).
2. GREEN: implement `CompactObservationFilterBar.tsx` minimal.
3. RED→GREEN: FilterSheet `variant="right"` tests, then the variant + `slideInRight` keyframe.
4. RED→GREEN: `useMediaQuery` hook tests, then the hook; then DataScreen map-view wiring tests (compact bar renders, drawer opens/closes, one sheet per viewport, chip dismiss hits setters, badge count, grid/mobile unchanged), then the DataScreen changes + `activeFilterCount`.
5. `npm run extract-messages`; fill `pt.json`/`es.json`; i18n test/check.
6. Full `npm test`, `npm run test:coverage` (≥80%), lints.
7. **Storybook/visual baseline:** NO existing map-view Data story exists, so no current baselines change. If stories are added for `CompactObservationFilterBar` or the right variant, new required PNGs land under `tests/e2e/storybook-screenshots-baseline/{desktop,mobile}/` and must be committed with the PR — `visual-regression-check` is a blocking CI job.
8. **QA deliverable:** write `docs/qa/330.md` (Human QA Handoff invariant) covering desktop drawer open/close, chip dismissal, mobile bottom-sheet regression, grid-view regression.

## Self-review (P1/P2 pass — resolved in this spec)

- **P1 Two-instance FilterSheet / CSS-only variant selection**: SUPERSEDED — Radix `Dialog.Portal` mounts to `document.body`, escaping `hidden md:block` wrappers; two instances would render at every viewport. One instance, `useMediaQuery`-gated `variant`.
- **P1 Badge semantics ambiguity** (issue says "active-filter count badge", mobile shows result count): DECIDED — dimension count, max 4, categories = 1 dimension; result count lives on the line; mobile badge intentionally unchanged.
- **P1 Chip overflow / wrap on narrow desktop** (768-1024px with several chips): DECIDED — single line enforced via nowrap + horizontal scroll; button and count pinned; scroll container keyboard-accessible. No "+N" truncation (indeterminate behavior, harder to test deterministically).
- **P1 Breakpoint mismatch** (`useIsDesktop` = lg/1024 vs map-view desktop = md/768): DECIDED — `useMediaQuery('(min-width: 768px)')`; `useIsDesktop` must not gate this feature.
- **P1 jsdom test strategy**: DECIDED — mock `useMediaQuery`/`matchMedia` at the module boundary; `within()` scoping; real breakpoint behavior stays a browser concern (E2E if ever needed).
- **P1 Which component owns the compact line** (new variant vs `compact` mode): DECIDED — new `CompactObservationFilterBar`; `ObservationFilterBar` untouched (grid view + sheet body remain its only consumers).
- **P2 Drawer width/animation**: specified — `w-[min(380px,90vw)]`, full-height right drawer, `slideInRight` keyframe + Tailwind animate utility, z-index pattern unchanged (z-50 overlay / z-[51] content).
- **P2 Chip accessible names / keyboard dismissibility**: specified — `data.filters.removeFilter` label per chip; chips are real buttons.
- **P2 Chip-dismiss setter**: DECIDED — `toggleCategory(X)` normative; date chips render raw ISO strings.
- **P2 Visual baselines / QA handoff**: specified — no existing map-view baseline changes; new stories add new baselines; `docs/qa/330.md` required.
