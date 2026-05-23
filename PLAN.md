The plan is ready. (The `PLAN.md` write needs permission — I'll just present it here since this is plan-only.)

# Implementation Plan — Issue #21: Export observations as GeoJSON / CSV

## Locked decisions
- **`docId` source = `observation.localId`** — the field is `localId` in this local-first app (`src/lib/db.ts`), not `docId`. It's always present and stable.
- **GeoJSON `properties`**: spread tags to top level with canonical keys winning collisions → `{ ...tags, docId, createdAt, updatedAt }` (GIS-queryable).
- **Empty state**: Export button **visible but disabled**.

## 1. Files

**Create**
| Path | Purpose |
|---|---|
| `src/lib/file-export.ts` | Generic Blob+anchor download (`triggerDownload`, `downloadText`) — shared by CSV + GeoJSON. |
| `src/lib/observation-export.ts` | **Pure** serializers: `observationsToGeoJson`, `observationsToCsv`, `buildExportFilename`, `slugifyProjectName`. No DOM. |
| `src/components/shared/ExportObservationsButton.tsx` | Secondary button + Radix dropdown-menu (GeoJSON/CSV items). |
| `tests/unit/lib/file-export.test.ts`, `tests/unit/lib/observation-export.test.ts`, `tests/unit/components/shared/ExportObservationsButton.test.tsx` | Tests. |

**Modify**
| Path | Change |
|---|---|
| `src/lib/geojson-export.ts` | Delegate to `downloadText(...)`; behavior identical → existing test stays green. |
| `src/screens/DataScreen.tsx` | Make `Tabs` controlled (`useState`); render `<ExportObservationsButton>` in the header row only when active tab = `observations`; pass `observations`, `projectName`, `disabled={len===0}`. Add i18n. |
| `tests/unit/screens/DataScreen.test.tsx` | Add: Export visible on observations tab; disabled when empty (mock the button/lib to avoid real downloads). |
| `src/i18n/{en,pt,es}.json` | New keys (en via `extract-messages`). |

## 2. Module APIs

```ts
// file-export.ts
export function triggerDownload(blob: Blob, filename: string): void;
export function downloadText(text: string, filename: string, mimeType: string): void;

// observation-export.ts
export type ExportFormat = 'geojson' | 'csv';
export function observationsToGeoJson(observations: Observation[]): FeatureCollection;
export function observationsToCsv(observations: Observation[]): string;
export function slugifyProjectName(name: string | undefined): string;          // -> "project" fallback
export function buildExportFilename(name: string | undefined, format: ExportFormat, date?: Date): string;
```

**GeoJSON Feature**: `geometry` = `{ type:'Point', coordinates:[lon,lat] }` when coords valid, else `null`; `properties` = `{ ...tags, docId: localId, createdAt, updatedAt }`.

**CSV columns**: `docId,category,lat,lon,createdAt,updatedAt,tags,photoUrls` — RFC-4180 quoting (`,"`/newline → wrap in `"`, inner `"`→`""`); `category`=`tags.category`, `tags`=`JSON.stringify(tags??{})`, `photoUrls`=stored comma-string (quoted); header always emitted.

**Component props**:
```ts
interface ExportObservationsButtonProps { observations: Observation[]; projectName: string | undefined; disabled?: boolean; }
```
`<Button variant="secondary" size="sm">` as `DropdownMenu.Trigger asChild`; items call `downloadText` with the right mime/filename. Uses `@radix-ui/react-dropdown-menu` (installed) directly — single consumer.

## 3. Data flow
`DataScreen` (observations + project name) → `ExportObservationsButton` → click menu item → **pure** `observationsTo{GeoJson,Csv}` + `buildExportFilename` → **DOM** `downloadText` → Blob → anchor.click → revoke → browser saves `{slug}-observations-{YYYY-MM-DD}.{geojson|csv}`. Button lives in the existing header flex row (with "Add Alert"); Tabs made controlled so it shows only on the observations tab.

## 4. TDD order
1. `file-export.test.ts` (mirror existing geojson-export mocks for `URL`/`createElement`).
2. `observation-export.test.ts` — the core: GeoJSON point/null-geometry/props/empty; CSV header/rows/empty-coords/JSON-tags/escaping; slug + injected-Date filename.
3. `ExportObservationsButton.test.tsx` — render, disabled-when-empty, menu items, click → `downloadText` spy with correct mime/filename.
4. `DataScreen.test.tsx` — button visible on observations tab, disabled when empty.
5. `test:coverage` (≥80%), `lint:types`, `lint:eslint`, `extract-messages`, `format`.

## 5. Edge cases
Empty list → disabled button + valid empty outputs · both coords missing → null geometry / empty CSV cells · only one of lat/lon → null geometry, CSV fills present cell · out-of-range/NaN → `isValidCoord` (mirror `data-layer.ts`) gates GeoJSON null · `tags` undefined → `{}` · tag values with `,"`/newline → CSV escaping · unsafe/empty project name → slug fallback `project` · large datasets → single in-memory Blob acceptable now (Web Worker/chunking is future, out of scope) · Alerts tab → button hidden.

## 6. i18n keys
`data.export.button` = "Export" · `data.export.menuLabel` = "Export observations" · `data.export.geojson` = "GeoJSON" · `data.export.csv` = "CSV" — extract to en.json, mirror in pt/es.

## 7. Acceptance checklist
- [ ] Export button on Observations tab (secondary/outline, header)
- [ ] GeoJSON FeatureCollection (Point geometry + tags/createdAt/updatedAt/docId props)
- [ ] CSV with all fields (docId, category, lat, lon, createdAt, updatedAt, tags, photoUrls)
- [ ] No-coords handled (CSV empty cells / GeoJSON `null` geometry)
- [ ] Filename `{project-slug}-observations-{date}.{geojson|csv}`
- [ ] i18n keys added (en/pt/es)
- [ ] Unit tests for serialization; coverage ≥80%; lint/types/format green

---

Two notes for when you implement:
- The issue says `docId` but this codebase uses **`localId`** — flagging so it's a conscious mapping, not a bug.
- "Observations tab only" requires converting `DataScreen`'s `Tabs` from uncontrolled (`defaultValue`) to controlled. If you'd rather avoid that churn, the alternative is rendering Export at the top of the observations `TabsContent` instead of the shared header — slightly less "header area" but zero Tabs changes.

Want me to proceed with implementation in TDD order, or adjust any decisions first?
