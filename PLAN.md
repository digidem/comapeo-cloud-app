I have everything I need. Here's the implementation plan.

---

# Implementation Plan — Issue #20: Map view toggle on Data screen Observations tab

## Summary of grounding findings

- `MapContainer` (`src/components/shared/MapContainer`) already accepts `initialViewState`, `mapRef`, `interactive`, `showBasemapSwitcher`, `height`, `className`, and children (Markers/Sources). Barrel exports `MapContainer`.
- `AreaMap.tsx` is the canonical **bbox-fit pattern**: `@turf/bbox` → `[[minLng,minLat],[maxLng,maxLat]]` → `mapRef.current.fitBounds(bounds, { padding, duration })`, gated by an `isMapLoadedRef` and re-fired on both `onLoad` and a `useEffect` keyed on bounds.
- `ObservationDetailScreen.tsx` is the canonical **Marker pattern**: `Marker` from `react-map-gl/maplibre` with a styled `<div>` pin child.
- Observation objects expose `localId`, `lat?`, `lon?`, `tags?`, `createdAt`. `useObservations(projectId)` returns them from cache (TanStack Query, keyed `['observations', projectId]`).
- `data-layer.ts` already has `isValidCoord(lat, lon)` (not exported) and an async `getProjectPoints` that builds `FeatureCollection<Point>` with `properties.localId`. We won't call the async one (data is already in cache); we'll mirror the same filter/shape in a small pure helper.
- Navigation: `useNavigate` from `@tanstack/react-router` is the established pattern (`navigate({ to, params })`).
- Existing `DataScreen.test.tsx` mocks `@tanstack/react-router` (only `Link`) and Radix `Tabs`. Screenshot tests live in `tests/e2e/observations.screenshots.ts`.

---

## 1. Files to create / modify

### Create
| Path | Purpose |
|------|---------|
| `src/components/shared/ObservationsMap/ObservationsMap.tsx` | Full-width map plotting all geo-tagged observations as clickable Markers, auto-fitting bounds. |
| `src/components/shared/ObservationsMap/index.ts` | Barrel export. |
| `tests/unit/components/shared/ObservationsMap.test.tsx` | Unit tests for the map component (markers, exclusion, navigation, bounds-fit). |

### Modify
| Path | Change |
|------|--------|
| `src/screens/DataScreen.tsx` | Add `viewMode` state + grid/map toggle button in the tab header; convert `Tabs` to **controlled** so the toggle only shows on the Observations tab; render `ObservationsMap` in map mode. New i18n keys. |
| `tests/unit/screens/DataScreen.test.tsx` | Add `useNavigate` to router mock; mock `@/components/shared/ObservationsMap`; tests for toggle presence + grid↔map switching. |
| `tests/e2e/observations.screenshots.ts` | Add a map-view screenshot (click toggle → capture) at both viewports. |
| `src/i18n/en.json` (+ `pt.json`, `es.json`) | Regenerated via `npm run extract-messages`; add translations. |

> Decision: place `ObservationsMap` under `components/shared/` (not `screens/`) for reusability and isolated testing — it depends only on the data-layer `Observation` type, not on DataScreen.

---

## 2. Component hierarchy & props interfaces

```
DataScreen
 ├─ Tabs (now CONTROLLED: value=activeTab, onValueChange=setActiveTab)
 │   ├─ header row (flex justify-between)
 │   │   ├─ TabsList (Observations / Alerts)
 │   │   ├─ [activeTab==='observations'] ViewToggle  ← grid/map icon button
 │   │   └─ Link "Add Alert"
 │   ├─ TabsContent "observations"
 │   │   └─ viewMode==='grid' ? <card grid (unchanged)> : <ObservationsMap observations=… />
 │   └─ TabsContent "alerts" (unchanged)
```

**`ObservationsMap` props:**
```ts
interface ObservationsMapProps {
  /** Full observation list (geo + non-geo); component filters internally. */
  observations: Observation[];          // import type from '@/lib/data-layer'
  /** Optional height override; defaults to a responsive mobile-friendly value. */
  height?: string | number;
  /** Test/storybook seam: override navigation. Defaults to TanStack useNavigate. */
  onMarkerClick?: (observationId: string) => void;
}
```

**Toggle button** (inline in DataScreen, ~44px touch target): a single `<button>` toggling `viewMode`, showing a map icon when in grid mode and a grid icon when in map mode, with `aria-label` + `aria-pressed`. Inline SVGs matching the existing icon style (stroke `currentColor`, 24×24 viewBox), styled like AreaMap's overlay button (`rounded-button`, `min-h-[44px]`).

---

## 3. Data flow: markers ↔ observation data

1. `DataScreen` already calls `useObservations(selectedProjectId)` → `observations` array (cached).
2. Same array is passed to `<ObservationsMap observations={observations} />` — **no new fetch**.
3. Inside `ObservationsMap`:
   - `geoObservations = useMemo(() => observations.filter(o => o.lat != null && o.lon != null && isValidCoord(o.lat, o.lon)), [observations])`.
   - `bounds = useMemo(...)`: build `FeatureCollection<Point>` from `geoObservations` (coords `[lon, lat]`), call `@turf/bbox`, return `[[minLng,minLat],[maxLng,maxLat]]`; return `undefined` when `geoObservations.length === 0` (wrapped in try/catch like AreaMap).
   - Render one `<Marker key={o.localId} longitude={o.lon} latitude={o.lat} anchor="bottom" onClick={…}>` per geo observation, reusing the pin `<div>` from `ObservationDetailScreen`.
   - Marker `onClick` → `navigate({ to: '/data/observations/$observationId', params: { observationId: o.localId } })` (or `onMarkerClick` if provided). Use the Marker event's `originalEvent.stopPropagation()` to prevent map drag/click conflicts.
   - Bounds fit: `isMapLoadedRef` + `fitBounds(bounds, { padding: 50, maxZoom: 14, duration: 800 })`, fired in `onLoad` and a `useEffect` keyed on `bounds` — identical structure to AreaMap. `maxZoom` prevents over-zoom on a single point.

---

## 4. Test strategy (TDD order)

**Step 1 — `ObservationsMap.test.tsx` (write first, watch fail):**
- Mock `@/components/shared/MapContainer` to a passthrough that renders `children` + a `data-testid="map-container"` and invokes `onLoad`.
- Mock `react-map-gl/maplibre` `Marker` to a `<button data-testid="obs-marker" onClick={onClick}>` wrapper exposing lon/lat via data attrs.
- Mock `@tanstack/react-router` `useNavigate`.
- Cases:
  1. Renders one marker per observation **with** valid coords.
  2. Excludes observations missing `lat`/`lon` (2 geo + 1 non-geo → 2 markers).
  3. Marker click → `navigate` called with `{ to: '/data/observations/$observationId', params: { observationId } }`.
  4. Empty geo set → renders map with no markers + the "no located observations" message; does not throw (bounds `undefined`).
  5. Bounds: assert `fitBounds` invoked (via a mocked `mapRef`/MapContainer `onLoad`) — at minimum that it doesn't crash with a single point.

**Step 2 — `DataScreen.test.tsx` additions:**
- Extend router mock with `useNavigate: () => vi.fn()`.
- Mock `@/components/shared/ObservationsMap` → `<div data-testid="observations-map" />` (keeps DataScreen test focused on toggle wiring).
- Cases:
  1. Grid view is default — cards render, `observations-map` absent.
  2. Toggle button present in the observations tab (by `aria-label`).
  3. Click toggle → `observations-map` appears, card grid hidden; click again → back to grid.
  4. Toggle is **not** rendered when there are zero observations? → still render it but it's harmless; assert it only appears under observations content (alerts tab unaffected). Given the mocked Tabs render all content, assert the toggle lives in the observations header region.

**Step 3 — implement** `ObservationsMap` + DataScreen changes to green.

**Step 4 — screenshots:** add a `observations map view` test in `observations.screenshots.ts` that navigates to `/data`, clicks the toggle (`getByRole('button', { name: /map view/i })`), waits for `domcontentloaded`, captures `observations-map-{theme}` at desktop + mobile.

**Step 5 — full suite:** `npm test`, `npm run test:coverage` (≥80%), `npm run test:screenshots`, `npm run review:visual`, `npm run lint:types`, `npm run extract-messages`.

---

## 5. Edge cases

| Case | Handling |
|------|----------|
| **Observation without lat/lon** | Filtered out of map markers; still in grid. (Acceptance criterion.) |
| **Zero geo observations (map view)** | `bounds === undefined` → skip `fitBounds`, keep fallback `initialViewState` (Amazon-ish `{-60,-3,zoom 4}` per AreaMap); overlay an i18n empty message ("No observations with location to show on the map"). |
| **Single geo observation** | bbox degenerates to a point; `fitBounds` with `maxZoom: 14` avoids infinite zoom. |
| **Invalid coords (NaN / out of range)** | Excluded via `isValidCoord` mirror. |
| **Clustering / many markers** | v1 uses individual DOM Markers (matches issue's "reuse Marker pattern"). Document that for very large datasets a maplibre GL `Source cluster:true` + circle layers is the upgrade path; out of scope here unless the dataset is known large. Will note in PR description, not implement. |
| **Map height on mobile (375px)** | Responsive height `h-[min(70vh,560px)]` (mobile) scaling up at `lg`, mirroring AreaMap's responsive container; full-width edge-bleed (`-mx-3`) optional — keep within content padding for simplicity. |
| **Tab switch resets view?** | `viewMode` persists across tab switches but toggle only shows on observations tab; acceptable. Default `grid` on mount. |
| **maplibre in jsdom** | Never imported in unit tests — `MapContainer` and `Marker` are mocked. Real rendering only in Playwright. |

---

## 6. i18n keys (added to `messages` in DataScreen + `ObservationsMap`)

| id | defaultMessage |
|----|----------------|
| `data.viewGrid` | `Grid view` |
| `data.viewMap` | `Map view` |
| `data.toggleView` | `Toggle map and grid view` (button `aria-label`) |
| `observationsMap.empty` | `No observations with location to show on the map` |
| `observationsMap.markerLabel` | `View observation` (marker `aria-label`) |

Run `npm run extract-messages`, then add `pt`/`es` translations.

---

## 7. Acceptance criteria checklist

- [ ] Map/grid toggle button in the Observations tab header (between TabsList and Add Alert) — *controlled Tabs + conditional render*
- [ ] Map view renders all geo-tagged observations as Markers — *`ObservationsMap` markers from cached `useObservations`*
- [ ] Tapping a Marker navigates to `/data/observations/$observationId` — *`useNavigate` in marker `onClick`*
- [ ] Map auto-fits bounds to all pins — *`@turf/bbox` + `fitBounds`, AreaMap pattern*
- [ ] Observations without lat/lon excluded from map (grid only) — *`isValidCoord` filter*
- [ ] Works on mobile 375px with sensible height — *responsive `h-[min(70vh,560px)]`*
- [ ] i18n keys added — *5 keys + extract*
- [ ] Unit + screenshot tests — *2 unit specs + 1 screenshot test, ≥80% coverage*

---

**Open decision for you:** the issue says "plot **all** observations" with individual Markers. For projects with hundreds of geo points, individual DOM markers degrade. My plan ships individual Markers (per the issue's explicit "reuse Marker pattern") and documents GL clustering as a follow-up. If you'd rather I build clustering now (maplibre `Source cluster:true` + circle/symbol layers, with cluster-click zoom), say so — it changes the marker section of the plan and adds ~1 test. Otherwise I'll proceed with individual Markers when implementation starts.
