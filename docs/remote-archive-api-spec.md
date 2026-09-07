# CoMapeo Cloud Remote Archive API Spec

> Generated from `demo.comapeo.cloud` (v0.4.0) + `comapeo-cloud` main branch source code.
> Auth: Bearer token (shared across all projects on the same server)

---

## Endpoints

### `GET /info` — Server info

```json
{
  "data": {
    "deviceId": "72e3043659c3ad81ffff8cfff00b69a3bfb8481a4b741ce3e6146c6830897f94",
    "name": "Demo CoMapeo Archive Server"
  }
}
```

### `GET /healthcheck` — Health check

Returns HTTP 200 (empty body).

---

### `GET /projects` — List projects (Bearer auth)

```json
{
  "data": [
    { "projectId": "base32-string", "name": "Project Name" }
  ]
}
```

`name` is optional (may be absent).

### `GET /projects/:id` — Project details (optional server capability)

When supported, returns one project object:

```json
{
  "data": {
    "projectId": "base32-string",
    "name": "Project Name"
  }
}
```

`name` is optional. Older/archive server versions may not implement this route and can return a route-shaped 404 even for projects returned by `GET /projects`. The app therefore treats the project list as authoritative and falls back to its basic project data when this detail endpoint is unsupported.

---

### `GET /projects/:id/observations` — List observations

> **Note:** This is the **plural** endpoint (`/observations`), kept for backwards compatibility.
> The new endpoint is `GET /projects/:id/observation` (singular, v0.5.0+).

**Response (200):**

```json
{
  "data": [
    {
      "docId": "hex-encoded-32-byte",
      "createdAt": "2025-08-03T16:36:19.423Z",
      "updatedAt": "2025-08-03T16:36:19.423Z",
      "deleted": false,
      "attachments": [
        {
          "url": "https://server/projects/:pid/attachments/:driveDiscoveryId/photo/:name"
        }
      ],
      "tags": {
        "limite": "yes",
        "notes": "Created by Luandro"
      },
      "lat": -4.2631,
      "lon": -70.2232
    }
  ]
}
```

**Field details:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `docId` | string | ✅ | Hex-encoded 32-byte buffer |
| `createdAt` | string (datetime) | ✅ | RFC3339 format |
| `updatedAt` | string (datetime) | ✅ | RFC3339 format |
| `deleted` | boolean | ✅ | |
| `lat` | number | ❌ | May be absent for coordinate-less observations |
| `lon` | number | ❌ | May be absent for coordinate-less observations |
| `attachments` | array | ✅ | Each attachment has `url` string; server may also send `driveDiscoveryId`, `type`, `name` |
| `tags` | object | ✅ | Key-value pairs; values can be `string`, `string[]`, `null`, `boolean`, `number` (server spec), but current app only handles `string \| string[]` |
| `presetRef` | object | ❌ | v0.5.0+ only; contains `{docId, versionId, url}` |
| `metadata` | object | ❌ | v0.5.0+ only; `{manualLocation?, position?}` |
| `versionId` | string | ❌ | v0.5.0+ only; core discovery id |
| `originalVersionId` | string | ❌ | v0.5.0+ only |
| `schemaName` | string | ❌ | v0.5.0+ only; `"observation"` |
| `links` | string[] | ❌ | v0.5.0+ only |
| `createdBy` | string | ❌ | v0.5.0+ only |
| `updatedBy` | string | ❌ | v0.5.0+ only |

**Demo server reality (v0.4.0):** None of the 380+ observations have `presetRef`. All use ad-hoc tag schemes with keys like `"limite": "yes"`, `"comrcio": "yes"`, `"notes"`, `"tree-condition": ["healthy", "unhealthy"]`. No `tags.category` either — the app's `getCategoryLabel()` fallback does not match these observations.

---

### `GET /projects/:id/preset` — List presets (v0.5.0+ only)

> ⚠️ **Not available on demo server (v0.4.0)** — returns 404.

**Response (200):**

```json
{
  "data": [
    {
      "docId": "hex-encoded-32-byte",
      "versionId": "hex/index-number",
      "originalVersionId": "hex/index-number",
      "schemaName": "preset",
      "createdAt": "2024-03-15T10:00:00Z",
      "updatedAt": "2024-03-15T10:00:00Z",
      "links": ["hex/index-number", "..."],
      "deleted": false,
      "name": "Deforestation",
      "geometry": ["point", "area"],
      "tags": { "category": "forest-risk" },
      "addTags": {},
      "removeTags": {},
      "fieldRefs": [
        { "docId": "field-001", "versionId": "field-001/0", "url": "/projects/:pid/field/field-001" }
      ],
      "iconRef": { "docId": "icon-001", "versionId": "icon-001/0", "url": "/projects/:pid/icon/icon-001" },
      "terms": ["logging", "clear-cut"],
      "color": "#FF5733",
      "createdBy": "...",
      "updatedBy": "..."
    }
  ]
}
```

**Field details:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `docId` | string | ✅ | |
| `versionId` | string | ✅ | `hex/index` format |
| `originalVersionId` | string | ✅ | |
| `schemaName` | `"preset"` | ✅ | Literal string |
| `createdAt` | string | ✅ | RFC3339 |
| `updatedAt` | string | ✅ | RFC3339 |
| `links` | string[] | ✅ | |
| `deleted` | boolean | ✅ | |
| `name` | string | ✅ | Display name |
| `geometry` | string[] | ✅ | Items: `"point"`, `"vertex"`, `"line"`, `"area"`, `"relation"`; unique items |
| `tags` | object | ✅ | `Record<string, boolean \| number \| string \| null \| (these)[]>` |
| `addTags` | object | ✅ | Same shape as tags |
| `removeTags` | object | ✅ | Same shape as tags |
| `fieldRefs` | array | ✅ | Each item: `{docId, versionId, url}`; server injects `url` via `expandManyRefs()` |
| `iconRef` | object | ❌ | `{docId, versionId, url}`; server injects `url` via `expandRef()` |
| `color` | string | ❌ | Hex format: `#rrggbb` |
| `terms` | string[] | ✅ | Synonyms for search |
| `createdBy` | string | ❌ | |
| `updatedBy` | string | ❌ | |

**Schema validation notes:**

- `v.object()` in Valibot is **permissive** — extra fields not in the schema are silently ignored (they pass through in the parsed output as a separate `unknown` key). The preset schema WILL accept extra server fields like `createdBy`, `updatedBy`.
- `fieldRefs` may be an empty array `[]` (some presets have no field references).
- `iconRef` is optional and may be absent entirely.
- Tag values can be `null`, `boolean`, `number`, `string`, or arrays of those — the app's `tagsSchema` correctly handles all these types.

---

### `GET /projects/:id/field` — List fields (v0.5.0+ only)

Not available on demo. Returns field definitions referenced by `preset.fieldRefs`.

```json
{
  "data": [
    {
      "docId": "field-001",
      "versionId": "field-001/0",
      "originalVersionId": "field-001/0",
      "schemaName": "field",
      "createdAt": "...",
      "updatedAt": "...",
      "links": [],
      "deleted": false,
      "type": "text",
      "key": "notes",
      "label": "Notes",
      "placeholder": "Enter notes...",
      "universal": false
    }
  ]
}
```

---

### `GET /projects/:id/track` — List tracks (v0.5.0+ only)

Returns track data with `presetRef` and `observationRefs` expanded with URLs. Not available on demo.

---

### `GET /projects/:id/remoteDetectionAlerts` — List alerts

**Response (200):**

```json
{
  "data": [
    {
      "docId": "hex-encoded-32-byte",
      "createdAt": "2025-05-28T23:44:04.698Z",
      "updatedAt": "2025-05-28T23:44:04.698Z",
      "deleted": false,
      "detectionDateStart": "2025-04-30T12:44:00.000Z",
      "detectionDateEnd": "2026-06-29T12:44:00.000Z",
      "sourceId": "test-123",
      "metadata": { "alert_type": "some-test" },
      "geometry": {
        "type": "Point",
        "coordinates": [-46.382854, -5.064616]
      }
    }
  ]
}
```

### `POST /projects/:id/remoteDetectionAlerts` — Create alert

**Request body:** all fields are required. `detectionDateStart` and `detectionDateEnd` must be ISO date-time strings, `sourceId` must be non-empty, and `metadata` may be an empty object.

```json
{
  "detectionDateStart": "2025-04-30T12:44:00.000Z",
  "detectionDateEnd": "2025-04-30T13:44:00.000Z",
  "sourceId": "glad-s2-123",
  "metadata": {},
  "geometry": {
    "type": "Point",
    "coordinates": [-46.382854, -5.064616]
  }
}
```

Geometry positions are `[longitude, latitude]`; longitude must be between -180 and 180 and latitude between -90 and 90. Line strings require at least 2 positions and polygon rings at least 4 positions.

**Response:** HTTP 201, empty body.

---

## Server Version Detection

The demo server at `demo.comapeo.cloud` runs **comapeo-cloud v0.4.0** which:
- Has `/observations` (plural) but NOT `/observation` (singular)
- Has NO `/preset`, `/field`, or `/track` endpoints
- Observations do NOT include `presetRef`, `versionId`, `originalVersionId`, `schemaName`, `links`, `metadata`, `createdBy`, or `updatedBy`

The current server branch adds these resources. The app deliberately continues to request the backwards-compatible plural `/observations` route, while using `/preset`, `/field`, and `/track` when available.

---

## Error Responses

All endpoints return errors in Fastify format:

```json
{
  "message": "Route GET:/projects/:pid/preset not found",
  "error": "Not Found",
  "statusCode": 404
}
```

Auth errors:
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized"
  },
  "statusCode": 401
}
```

---

## Reconciliation Contract

The client treats collection responses as **snapshots by default**. A server can explicitly override that mode with the `X-CoMapeo-Reconciliation-Mode` response header. Supported values are `snapshot`, `delta`, and `tombstone-stream`. `X-CoMapeo-API-Version` is recorded when present for diagnostics and future capability negotiation.

| Entity | Default 200 mode | Explicit tombstones | Omitted-row policy |
|---|---|---|---|
| Projects | Snapshot | Not currently emitted | Tombstone omitted projects and their local children |
| Observations | Snapshot | Preserve `deleted: true` | Tombstone omitted observations and dependent attachments |
| Alerts | Snapshot | Preserve `deleted: true` | Tombstone omitted alerts |
| Presets | Snapshot | Preserve `deleted: true` | Tombstone omitted presets only when the route is supported |
| Tracks | Snapshot | Preserve `deleted: true` | Tombstone omitted tracks only when the route is supported |
| Fields | Snapshot | Preserve `deleted: true` | Tombstone omitted fields only when the route is supported |

### Response classification

- **200 with data:** reconcile according to the declared or default mode.
- **200 with an empty `data` array:** a confirmed empty snapshot by default; stale rows are tombstoned according to the table above.
- **Fastify route-level 404** such as `Route GET:/projects/:id/track not found`: the endpoint is unsupported. Existing local rows are preserved and the resource outcome is `skipped` with a warning.
- **Project-level 404** such as `Project not found`: the project is missing. This is an error outcome and is never converted into an empty collection.
- **Delta or tombstone-stream:** omitted rows are preserved. Explicit server tombstones are still persisted.

### Owned work and cancellation

Project detail requests, project fan-out, per-project resources, and icon prefetch all use configurable concurrency limits. Every downstream archive request receives the sync `AbortSignal`; workers check cancellation before scheduling another item. Preset sync owns icon prefetch and does not report completion until all icon cache writes have settled. Individual icon failures become structured warnings rather than detached background mutations.

---

## Implication for Issue #45

The app validates API responses against Valibot schemas. A route-level 404 for `/preset` is now classified as an unsupported legacy endpoint, reported as a structured skipped-resource warning, and never interpreted as an empty snapshot. Existing local presets are preserved; a first connection to a v0.4 server still has no remote presets to load. With no presets available, `matchObservationToPreset()` returns `undefined` for every observation and the UI falls through to "Observation".

Even with a current server, the observations on this demo **have no `presetRef`** and use ad-hoc tags — so preset matching would rely entirely on the tag-scoring fallback in `preset-utils.ts:34-62`. That scoring requires preset tags like `{category: "forest-risk"}` to match observation tags like `{category: "forest-risk"}`, but demo observations use arbitrary keys like `{"limite": "yes"}`.

**Three compounding causes:**
1. Demo server v0.4.0 doesn't have `/preset` → route 404 → endpoint is skipped → no remote presets are available on first sync
2. Even with presets loaded, demo observations lack `presetRef` → no fast-path match
3. Demo observation tags don't match any preset's tag schemas → tag-scoring fallback also fails