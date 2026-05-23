I have enough context. Here's the detailed implementation plan.

---

# Implementation Plan — Issue #19: Observation Search & Filter

## 1. Architecture Overview

Separate **pure filter logic** (easily unit-tested) from **state management** (a hook) from **presentation** (a filter-bar component), then wire them into `DataScreen`. This keeps the "Unit tests for filter logic" AC satisfiable without touching React, and isolates Radix-Select interaction concerns away from the core logic.

```
DataScreen.tsx
 └─ useObservationFilters(observations)         ← hook: state + derived data
      ├─ filterObservations()  ┐                ← pure fns in observation-filters.ts
      └─ extractCategories()   ┘
 └─ <ObservationFilterBar />                     ← presentational controls
 └─ filtered grid (existing grid-cols layout)
```

**Key facts confirmed from the codebase:**
- `Observation` (from `@/lib/db`): `{ localId, projectLocalId, tags?: Record<string,string>, lat?, lon?, createdAt, updatedAt, ... }`. `tags` is `Record<string,string>` and may contain `category`, `notes`, `photoUrls`, `audioCount`.
- `createdAt` is an ISO string.
- UI primitives available: `Input` (requires a `label` prop, `min-h-[44px]`, supports `type="date"`), `Select` (Radix wrapper, `value`/`onValueChange`/`placeholder`/`ariaLabel`, `Select.Item`), `Button`, `Badge`.
- i18n: `defineMessages` with `id` + `defaultMessage`; flat keys in `src/i18n/messages/{en,pt,es}.json` as `"key": { "defaultMessage": "..." }`. Run `npm run extract-messages` to regenerate `en.json`.
- Existing `DataScreen.test.tsx` mocks the hooks, `project-store`, `tabs`, and tanstack `Link`.

---

## 2. Files to Create / Modify

### Create
| Path | Purpose |
|------|---------|
| `src/lib/observation-filters.ts` | Pure functions: `filterObservations`, `extractCategories`, types `ObservationFilters` / `ObservationSort`, `DEFAULT_FILTERS` |
| `src/hooks/useObservationFilters.ts` | Stateful hook wrapping the pure logic; returns filters, setters, `filteredObservations`, `availableCategories`, `isFiltering` |
| `src/components/shared/ObservationFilterBar.tsx` | Presentational toolbar (search, date range, category, sort, clear) |
| `tests/unit/lib/observation-filters.test.ts` | Unit tests for pure logic |
| `tests/unit/hooks/useObservationFilters.test.ts` | `renderHook` tests for state/derivation |
| `tests/unit/components/shared/ObservationFilterBar.test.tsx` | Rendering + callback tests |

### Modify
| Path | Change |
|------|--------|
| `src/screens/DataScreen.tsx` | Consume the hook, render `<ObservationFilterBar>`, map over `filteredObservations`, add "no results" empty state |
| `tests/unit/screens/DataScreen.test.tsx` | Add integration tests for search + no-results state |
| `src/i18n/messages/en.json` | New `data.filters.*` keys (via `extract-messages`) |
| `src/i18n/messages/pt.json` | PT translations |
| `src/i18n/messages/es.json` | ES translations |

---

## 3. Module Contracts

### `src/lib/observation-filters.ts`
```ts
import type { Observation } from '@/lib/db';

export type ObservationSort = 'newest' | 'oldest' | 'category';

export interface ObservationFilters {
  search: string;          // free text, matched case-insensitively
  startDate: string | null; // 'YYYY-MM-DD' (inclusive) or null
  endDate: string | null;   // 'YYYY-MM-DD' (inclusive) or null
  category: string | null;  // exact tags.category match, or null = all
  sort: ObservationSort;
}

export const DEFAULT_FILTERS: ObservationFilters = {
  search: '', startDate: null, endDate: null, category: null, sort: 'newest',
};

// Distinct, sorted, non-empty tags.category values across observations.
export function extractCategories(observations: Observation[]): string[];

// Applies search + date range + category, then sorts. Pure, no mutation.
export function filterObservations(
  observations: Observation[],
  filters: ObservationFilters,
): Observation[];
```

**Filter semantics:**
- **search**: lowercase trim; match if `tags.category`, `tags.notes`, OR any string value in `tags` `includes` the term. Empty/whitespace → no-op.
- **date range**: compare `new Date(obs.createdAt)` against `startDate` (>= start-of-day) and `endDate` (<= end-of-day, i.e. `< endDate + 1 day` or set time to 23:59:59.999). Either bound independently optional.
- **category**: `obs.tags?.category === filters.category` when set.
- **sort**: `newest`/`oldest` by `createdAt` (string compare on ISO is safe, but use `Date` to be robust); `category` alphabetical by `tags?.category ?? ''` (case-insensitive `localeCompare`), with a stable secondary sort by `createdAt` desc.

### `src/hooks/useObservationFilters.ts`
```ts
export interface UseObservationFiltersResult {
  filters: ObservationFilters;
  setSearch: (v: string) => void;
  setStartDate: (v: string | null) => void;
  setEndDate: (v: string | null) => void;
  setCategory: (v: string | null) => void;
  setSort: (v: ObservationSort) => void;
  reset: () => void;
  filteredObservations: Observation[];   // useMemo(filterObservations)
  availableCategories: string[];         // useMemo(extractCategories) — from FULL list
  isFiltering: boolean;                  // any filter deviates from DEFAULT_FILTERS
}

export function useObservationFilters(
  observations: Observation[],
): UseObservationFiltersResult;
```
- `availableCategories` derives from the **unfiltered** list so options don't vanish as you filter.
- `isFiltering` drives the "no results" vs "no observations yet" distinction and the Clear button visibility.

### `src/components/shared/ObservationFilterBar.tsx`
```ts
export interface ObservationFilterBarProps {
  filters: ObservationFilters;
  availableCategories: string[];
  resultCount: number;
  isFiltering: boolean;
  onSearchChange: (v: string) => void;
  onStartDateChange: (v: string | null) => void;
  onEndDateChange: (v: string | null) => void;
  onCategoryChange: (v: string | null) => void;
  onSortChange: (v: ObservationSort) => void;
  onClear: () => void;
}
```
**Layout:** responsive `flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end`. Reuse `Input` for search (`type="text"`) and the two dates (`type="date"`); reuse `Select` for category (first item = "All categories" mapped to `null`) and sort. A `Button variant="ghost" size="sm"` "Clear filters" shown only when `isFiltering`. Show `resultCount` as a small muted line. All controls already meet the 44px touch-target rule via `Input`/`Select`.

> **Select↔null mapping note:** Radix `Select` values are strings. Use a sentinel `"__all__"` for the "all categories" item and map `"__all__" → null` in the `onCategoryChange` adapter (do this inside `ObservationFilterBar`, keep the public callback `string | null`).

---

## 4. Data Flow

```
useObservations(projectId)         → observations (TanStack Query cache, unchanged)
        │
        ▼
useObservationFilters(observations)
   ├── availableCategories  ──► ObservationFilterBar (dropdown options)
   ├── filters + setters    ──► ObservationFilterBar (controlled inputs)
   └── filteredObservations ──► grid .map()
```
No new query, no new query-key, no server calls — purely client-side over cached data, exactly as the issue specifies. When the server adds paginated search (digidem/comapeo-cloud#21), `useObservationFilters` can be swapped to push `filters` into the query key without changing `DataScreen`'s JSX.

---

## 5. DataScreen Integration

Within the Observations `TabsContent`, change the success branch:
1. Compute `const obsFilters = useObservationFilters(observations);` at the top of the component (hooks must be unconditional — call it before the early `return`s, passing `observationsQuery.data ?? []`).
2. Order of branches stays: `isError` → `isPending` → **`observations.length === 0`** ("No observations yet") → otherwise render `<ObservationFilterBar>` + grid.
3. New nested branch: if `observations.length > 0 && filteredObservations.length === 0` → render the "no results" empty state (with Clear-filters affordance) **instead of** the grid, but still render the filter bar above it.
4. Grid maps over `obsFilters.filteredObservations` instead of `observations`. The `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3` markup is unchanged.
5. The Observations tab count badge: keep showing total `observations.length` (the tab label), but the filter bar shows `resultCount`.

**Hook-ordering caveat:** `DataScreen` currently early-returns before observations exist. `useObservationFilters` must be called unconditionally near the other `useQuery`/`useMemo` calls (top of component), e.g. `const obsFilters = useObservationFilters(observationsQuery.data ?? []);`.

---

## 6. Test Strategy (TDD order)

**Step 1 — `tests/unit/lib/observation-filters.test.ts` (write first, watch fail, implement):**
- `extractCategories`: dedupes, sorts, drops observations with no `tags.category`, returns `[]` for empty input.
- `filterObservations` search: matches on `category`, on `notes`, on an arbitrary tag value; case-insensitive; trims; empty term returns all.
- date range: start only, end only, both; inclusive boundaries (an obs exactly on `endDate` is included); out-of-range excluded.
- category: exact match; `null` returns all.
- sort: `newest` (desc), `oldest` (asc), `category` (A→Z, case-insensitive).
- combined filters (search + category + date) applied together.
- does not mutate the input array.

**Step 2 — `tests/unit/hooks/useObservationFilters.test.ts` (`renderHook` + `act`):**
- initial state equals `DEFAULT_FILTERS`; `filteredObservations` equals input sorted newest.
- `setSearch` narrows `filteredObservations`.
- `setCategory` / date setters update `filters` and derived list.
- `availableCategories` stays constant after filtering (derived from full list).
- `isFiltering` flips true on any change, false after `reset`.
- `reset` restores defaults.

**Step 3 — `tests/unit/components/shared/ObservationFilterBar.test.tsx`:**
- renders search/date/category/sort controls with labels (i18n strings).
- category Select lists each `availableCategories` entry + "All categories".
- typing in search fires `onSearchChange`.
- changing date inputs fires `onStartDateChange`/`onEndDateChange` (native inputs → `fireEvent.change`).
- "Clear filters" hidden when `isFiltering=false`, visible + fires `onClear` when true.
- shows `resultCount`.
> For Radix `Select` interaction in jsdom (pointer events are awkward), prefer asserting rendered options and that the adapter maps `"__all__" → null`; exhaustive selection behavior is covered at the hook/pure-logic layer.

**Step 4 — extend `tests/unit/screens/DataScreen.test.tsx`:**
- Use the existing hook-mock pattern (don't mock `useObservationFilters` — let the real hook run over `mockObservationsQuery.data`).
- typing a search term that matches one of `defaultObservations` shows only the matching card (e.g. search "Deforestation" → only `forest` card).
- search term matching nothing → "no results" empty state, and "No observations yet" is NOT shown (distinguish from empty data).
- with `data: []` the existing "No observations yet" test still passes (filter bar not shown when zero total).

Run `npm run test:coverage` last to confirm the 80% threshold holds (pure-logic + hook tests give high coverage cheaply).

---

## 7. Edge Cases

| Case | Behavior |
|------|----------|
| Project has 0 observations | "No observations yet" (existing); filter bar **not** rendered |
| Observations exist, filters match none | Filter bar shown + new "No observations match your filters" state + Clear button |
| Loading / error | Unchanged — branches run before filtering |
| Observation with no `tags.category` | Excluded from `availableCategories`; matched only by search on other tag values; sorts under `''` for category sort |
| Observation with no `tags` at all (`tags?` optional) | Guard with `obs.tags ?? {}`; search/category simply don't match |
| `startDate` > `endDate` | Yields empty set (acceptable); no validation error thrown |
| Invalid/malformed `createdAt` | `new Date(...)` → `NaN`; treat as non-matching for date filter, sort last (defensive guard) |
| Search whitespace only | Treated as empty (no filtering) |
| Filters persist across project switch | Reset filters when `selectedProjectId` changes (effect in the hook keyed on a `projectId` arg, **or** reset in `DataScreen`); recommend passing `projectId` to the hook and resetting on change to avoid stale category selections |

---

## 8. i18n Keys (new `data.filters.*`)

| Key | en defaultMessage |
|-----|-------------------|
| `data.filters.searchLabel` | "Search" |
| `data.filters.searchPlaceholder` | "Search by category or notes" |
| `data.filters.startDateLabel` | "From" |
| `data.filters.endDateLabel` | "To" |
| `data.filters.categoryLabel` | "Category" |
| `data.filters.categoryAll` | "All categories" |
| `data.filters.sortLabel` | "Sort" |
| `data.filters.sortNewest` | "Newest first" |
| `data.filters.sortOldest` | "Oldest first" |
| `data.filters.sortCategory` | "Category (A–Z)" |
| `data.filters.clear` | "Clear filters" |
| `data.filters.noResults` | "No observations match your filters" |
| `data.filters.resultCount` | "{count, plural, one {# result} other {# results}}" |

Add via `defineMessages` in `ObservationFilterBar.tsx` (and `data.filters.noResults` in `DataScreen.tsx`), then run `npm run extract-messages` to populate `en.json`. Manually add PT/ES translations (CI has an i18n check). Suggested:
- PT: "Pesquisar", "Pesquisar por categoria ou notas", "De", "Até", "Categoria", "Todas as categorias", "Ordenar", "Mais recentes primeiro", "Mais antigas primeiro", "Categoria (A–Z)", "Limpar filtros", "Nenhuma observação corresponde aos filtros", "{count, plural, one {# resultado} other {# resultados}}".
- ES: "Buscar", "Buscar por categoría o notas", "Desde", "Hasta", "Categoría", "Todas las categorías", "Ordenar", "Más recientes primero", "Más antiguas primero", "Categoría (A–Z)", "Borrar filtros", "Ninguna observación coincide con los filtros", "{count, plural, one {# resultado} other {# resultados}}".

---

## 9. Acceptance Criteria Mapping

- [ ] **Search input filters in real-time** → `ObservationFilterBar` search `Input` → `onSearchChange` → `setSearch` → `filterObservations` (synchronous, re-renders immediately)
- [ ] **Date range filter (start + end)** → two `type="date"` `Input`s → `startDate`/`endDate` filters
- [ ] **Category tag filter dropdown** → `Select` populated from `availableCategories` + "All categories"
- [ ] **Sort toggle (newest/oldest)** → sort `Select` with `newest`/`oldest` (+ `category` A–Z bonus per issue notes)
- [ ] **i18n keys in en.json + PT/ES** → §8
- [ ] **Unit tests for filter logic** → `observation-filters.test.ts` (+ hook + component tests)
- [ ] **80% coverage maintained** → pure-logic + hook tests; verify with `npm run test:coverage`
- [ ] **Grid layout preserved** → `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` untouched
- [ ] **Empty/no-results states** → §7 distinguishes "no observations yet" vs "no matches"

---

## Open Decisions

A couple of choices I'd lock in before coding — flagging them since they affect the component API:

1. **Category filter: single-select dropdown vs. multi-select tag chips.** The AC says "dropdown," and the issue says "dropdown/tag selector." Single `Select` is the lowest-risk match for the AC and existing primitives; multi-select would need a new popover/checkbox pattern (no existing primitive). I've planned single-select.

2. **Search input label.** The `Input` primitive always renders a visible `<label>`. I've planned a visible "Search" label for consistency/accessibility rather than introducing an sr-only variant.

Both are reasonable defaults baked into the plan above — no need to block on them unless you'd prefer the multi-select chips or an icon-only search field, in which case the component scope grows slightly.
