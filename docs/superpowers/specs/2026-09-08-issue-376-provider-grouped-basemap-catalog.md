
# CoMapeo Cloud App — Issue #376 implementation-ready spec

**Issue:** #376 — feat(map): group basemap switcher by provider, expand catalog
**Base:** `origin/main` at `4080319` (2026-09-08; reviewed at `798846e`, delta re-verified — only `smp-download.ts` changed, unrelated to this spec's constraint table), inspected 2026-09-08
**Supersedes:** none
**Superseded-by:** none
**Status:** draft — reviewed by Opus 5 (NEEDS_REWRITE → all P1/P2 fixes incorporated); **rev2 2026-09-08 — Google added per product-owner decision (see Decision log); rev3 2026-09-08 — Gemini 3.8 Flash pre-merge review fixes (OpenFreeMap fully specified, StylePicker AC added, popover width pinned)**; not implementation-ready until this file is merged
**Split:** none. One independently mergeable unit — no PR1/PR2 gate, one ownership
boundary (the basemap catalog and its presentation), one coherent reviewable objective.

This spec is the canonical single source of truth for issue #376. Where the issue
body and this file disagree, this file wins.

> **Scope correction.** The originating issue proposed sourcing ~30 basemaps across
> ~8 providers from `nextgis/quickmapservices`. Review found most of those unusable:
> Bing (free tier shut down 2025-06-30; quadkey unsupported), Stamen (tiles dead since
> 2023-10-31; Stadia-hosted requires keys), Mapbox / HERE / Thunderforest (API key),
> Wikimedia (third-party use prohibited). The cited upstream licence (CC-BY-SA 3.0)
> is also wrong (GPL-2.0-or-later), and upstream self-declares its data unvalidated
> and possibly licence-violating. **Google is INCLUDED by explicit product-owner
> decision (2026-09-08): the app follows the QuickMapServices access model — Google's
> keyless `mt{0-3}.google.com/vt` raster endpoints, live-verified 2026-09-08 (HTTP 200,
> `image/jpeg`/`image/png`, `access-control-allow-origin: *`).** This spec ships a
> curated, keyless, verified catalog with **provider-grouped** UI; see Decision log.

---

## Goal

Make the basemap list scannable by grouping it under provider headings, and grow it
with additional free, no-key, live-verified imagery sources — without widening the
`/api/tiles` proxy trust surface and without shipping any entry that requires an API
key or breaches a provider's terms (barring the accepted Google ToS risk documented
in the Decision log).

## Product model (DECIDED)

- **Every catalog entry is anonymously fetchable.** No API key, no token, no
  registration, no per-domain allowlisting at the provider. An entry that cannot be
  fetched with a bare unauthenticated GET does not go in the catalog.
- **Google follows the QuickMapServices access model (product-owner decision, 2026-09-08).**
  Keyless `mt{0-3}.google.com/vt/lyrs={s,m,y,p}` endpoints; no key, no Google SDK, no
  Google billing. The spec review's recorded position — that these endpoints fall under
  Google Maps Platform ToS §3.2.3(a) ("No Scraping") — is acknowledged and the risk
  explicitly accepted by the product owner. Recorded in `docs/qa/376.md`.
- **Provider is a closed set.** Grouping is total: every entry belongs to exactly one
  known provider, enforced by the schema, not by convention.
- **Liveness is a merge gate, not a review opinion.** The catalog is whatever passes
  `scripts/qa/verify-basemaps.mjs`. A candidate that fails is dropped from the PR, not
  merged with a comment.
- **Grouping is presentation only.** No change to persisted basemap selection, to
  `DEFAULT_BASEMAP_ID`, or to how a basemap becomes a MapLibre style.

## Non-goals

- API-key-gated or paid providers (Bing/Azure Maps, Mapbox, HERE,
  Thunderforest, Stadia/Stamen). Tracked in #377. Google Maps Platform's official
  APIs/SDKs are equally out of scope — Google ships via the keyless endpoints above,
  not via Google billing.
- Wikimedia tiles (third-party use prohibited by their Maps Terms of Use).
- Copying data from `nextgis/quickmapservices` or `_contrib`. It may be consulted as a
  lead list; entries are hand-authored from each provider's own documentation.
- A **search/filter input** in the switcher. At ~16 entries in ~5 groups, headings are
  sufficient; a text input adds state, focus management and i18n for no gain. Revisit
  only if the catalog passes 30 entries.
- Collapsible provider groups and auto-expansion of the selected group.
- User-added custom basemaps beyond the existing `StylePicker` custom-URL flow.
- Any change to `normalizeTileUrl`, `basemapToMapStyle`, `smp-download.ts`, tile
  caching, or the proxy's security controls.
- Fixing the pre-existing `role="menuitemradio"`-without-`role="menu"` nesting
  (`BasemapSwitcher.tsx:95`). Existing roles are preserved per the issue; recorded as
  debt in the QA doc.

## Current-code constraints

| File | Constraint this spec must respect |
|---|---|
| `src/lib/map/basemaps.ts:9-85` | Flat `BASEMAP_CATALOG: ImageryBasemap[]`, 8 entries. `DEFAULT_BASEMAP_ID = 'carto-positron'` (`:88`). `findBasemap` fallback chain (`:96-113`) must keep working unchanged. |
| `src/lib/schemas/imagery-source.ts:37-65` | `commonBasemapFields` is shared by both variants of the `v.variant('type', …)` union. Adding a required field there affects raster **and** style entries. |
| `src/components/shared/MapContainer/BasemapSwitcher.tsx:93-129` | Flat `basemaps.map`. `data-testid="basemap-switcher"`, `data-testid="basemap-switcher-trigger"`, `role="menuitemradio"` + `aria-checked` must all survive. |
| `src/screens/MapScreen/StylePicker.tsx:94-122` | Second consumer of `BASEMAP_CATALOG`; also constructs a custom-URL basemap object that will now need a `provider`. |
| `src/lib/map/tile-hostname-allowlist.ts:13-41` | Shared by the client and `functions/api/tiles/index.ts:229`. `*.arcgisonline.com` and `*.openstreetmap.fr` patterns already cover several candidates. |
| `src/lib/map/smp-download.ts:145-152` | Every raster entry is bulk-fetched through `/api/tiles` during offline packaging. A catalog entry is therefore also a **server-side** fetch of that provider, under our origin. For Google entries, normal map display fetches are browser-direct (the `mt` endpoints return `access-control-allow-origin: *`, verified 2026-09-08); the proxy path applies to SMP offline packaging. |
| `src/lib/map/basemap-utils.ts:84-101` | `normalizeTileUrl` supports `{z} {x} {y} {zoom} {switch:…} {-y}` only. `{quadkey}`, `{bbox-epsg-3857}`, `{apikey}`, `{key}` are unsupported. |
| `functions/api/tiles/index.ts:263-269` | Proxy MIME allowlist: `image/png`, `image/jpeg`, `image/webp`, `application/octet-stream`, `application/vnd.mapbox-vector-tile`. A raster entry serving anything else 502s during SMP download even if the hostname is allowed. |

## Ownership boundary

Owned by this issue: `provider` on `imageryBasemapSchema`; `BASEMAP_CATALOG` contents;
`PROVIDER_ORDER`; grouping in `BasemapSwitcher` and `StylePicker`; provider i18n keys;
`scripts/qa/verify-basemaps.mjs`; new allowlist entries.

Not owned: proxy security logic, SMP download, MapLibre style construction, map store.

## Implementation

### 1. Schema — `src/lib/schemas/imagery-source.ts`

Add a **required** provider slug to `commonBasemapFields`:

```ts
export const basemapProviderSchema = v.picklist([
  'carto',
  'esri',
  'google',
  'openstreetmap',
  'openfreemap',
  'opentopomap',
  'usgs',
  'custom',
  // extend only with a provider that has passed the verification gate
]);

const commonBasemapFields = {
  id: v.string(),
  name: v.string(),
  category: basemapCategorySchema,
  provider: basemapProviderSchema,   // required, closed set
  attribution: v.optional(v.string()),
  // …unchanged
};

export type BasemapProvider = v.InferOutput<typeof basemapProviderSchema>;
```

Required-and-closed rather than the issue's optional free string, because (a) optional
permits ungroupable entries, and (b) a free string makes i18n-key coverage untestable —
a typo silently creates a group with no label. `'custom'` exists so the `StylePicker`
custom-URL path can construct a valid `ImageryBasemap`.

`StylePicker`'s custom-URL construction must set `provider: 'custom'`. Custom entries
are never rendered in a provider group.

### 2. Provider order — `src/lib/map/basemaps.ts`

```ts
export const PROVIDER_ORDER: readonly Exclude<BasemapProvider, 'custom'>[] = [
  'carto', 'esri', 'google', 'openstreetmap', 'openfreemap', 'opentopomap', 'usgs',
];

export function groupBasemapsByProvider(
  basemaps: ImageryBasemap[],
): { provider: BasemapProvider; basemaps: ImageryBasemap[] }[];
```

Explicit ordinal, not alphabetical. Alphabetical-by-localized-label reorders between
en/pt/es, which would make the three locales' Storybook baselines structurally
different and the group order untestable with a single assertion. Within a group,
entries keep declaration order. `groupBasemapsByProvider` preserves that order,
emits groups in `PROVIDER_ORDER`, and omits empty groups.

### 3. Catalog — `src/lib/map/basemaps.ts`

Retain all 8 existing entries; add `provider` to each. Add candidates from the list
below **only** after each passes the §5 verification gate. A candidate that fails is
removed from the PR.

Candidates (each requires live verification before inclusion — none is asserted here
as working):

| Candidate | Host | Allowlist status | Notes |
|---|---|---|---|
| Esri World Street Map | `services.arcgisonline.com` | covered by `*.arcgisonline.com` | same service family as two already-shipped entries |
| Esri World Ocean Base | `services.arcgisonline.com` | covered | `Ocean/World_Ocean_Base` |
| Esri World Shaded Relief | `services.arcgisonline.com` | covered | terrain shading |
| OSM Humanitarian (HOT) | `*.tile.openstreetmap.fr` | covered by `*.openstreetmap.fr` | free, no key |
| CyclOSM | `*.tile-cyclosm.openstreetmap.fr` | covered by `*.openstreetmap.fr` | free, no key — **not** Thunderforest OpenCycleMap |
| OSM Germany | `*.tile.openstreetmap.de` | already exact-listed `:26-28` | listed but currently unused by the catalog |
| Google Satellite | `mt0.google.com` … `mt3.google.com` | **new pattern required**: `^mt\d\.google\.com$` | `/vt/lyrs=s&x={x}&y={y}&z={z}` — live-verified 200 `image/jpeg`, `access-control-allow-origin: *`, 2026-09-08 |
| Google Streets | `mt0-3.google.com` | same pattern | `lyrs=m` — live-verified 200 `image/png` 2026-09-08 |
| Google Hybrid | `mt0-3.google.com` | same pattern | `lyrs=y` — live-verified 200 `image/jpeg` 2026-09-08 |
| Google Terrain | `mt0-3.google.com` | same pattern | `lyrs=p` — live-verified 200 `image/jpeg` 2026-09-08 |
| OpenFreeMap Liberty + Bright | `tiles.openfreemap.org` | **new entry required** (exact host) | vector style (`GET …/styles/{liberty,bright}`); live-verified 2026-09-08: HTTP 200, MapLibre style JSON `version: 8`, no key; free hosting per openfreemap.org terms |

Explicitly **excluded**, with reason recorded in `docs/qa/376.md`: Bing (free tier
ended 2025-06-30; quadkey unsupported), Mapbox / HERE / Thunderforest / Stadia-Stamen
(API key), Wikimedia (third-party use prohibited), Esri NatGeo World Map and USA Topo
Maps (Esri-deprecated legacy basemaps; USA Topo in mature support since 2021-06,
retiring 2029-12). Google is **included** per the Decision log (keyless `mt` endpoints;
the legacy `khms`/`kh` endpoint returned 404 on 2026-09-08 and is not used).

Each entry's `attribution` is copied verbatim from the provider's own attribution
requirement, matching the existing file's stated convention (`basemaps.ts:7`).

### 4. Allowlist — `src/lib/map/tile-hostname-allowlist.ts`

Add exact hostnames only, or a pattern scoped to a single tile-serving zone. **No
pattern may match a general-purpose hosting domain.** Update the
`SUPPORTED TILE PROVIDERS` block in `functions/api/tiles/index.ts:51-62` in the same
PR so the two do not drift. Every added entry must have a corresponding catalog entry
in the same PR — the allowlist is not a place to pre-stage providers.

### 5. Verification gate — `scripts/qa/verify-basemaps.mjs`

Runnable, no arguments, exits non-zero with a per-entry failure table.

For each `BASEMAP_CATALOG` entry, with **no** credentials, cookies or `Authorization`
header:
- `raster`: substitute `z=2, x=1, y=2` (first `{switch:}` variant; `{-y}` → the
  scheme-correct value), `GET`, assert `200`, assert `Content-Type` ∈ the proxy's
  `ALLOWED_MIME_TYPES`, assert a non-empty body.
- `style`: `GET`, assert `200`, assert the body parses as JSON with `version === 8`.
- Assert the final URL is same-host (no cross-host redirect), since the proxy runs
  `redirect: 'manual'` and 502s on any 3xx (`functions/api/tiles/index.ts:246-248`).

CI wiring: runs on PRs that touch `src/lib/map/basemaps.ts` or
`tile-hostname-allowlist.ts` (**blocking**), and on the existing Monday schedule
(**non-blocking**, opens/updates an issue on failure). Non-blocking on schedule
because a third-party outage must not red an unrelated main branch; blocking on the
touching PR because that is when a bad entry is being introduced.

### 6. UI — `BasemapSwitcher.tsx`

- Wrap each provider's items in `<div role="group" aria-labelledby={headerId}>` with a
  visible `<div id={headerId}>` header showing the localized provider name.
- Header style per `DESIGN_OVERVIEW.md`: `text-xs font-medium text-text-muted`,
  matching the existing "Basemap" label (`BasemapSwitcher.tsx:90-92`). Items indent
  one step (`pl-4` on group items). No solid borders between groups — tonal separation only.
- **Unchanged:** `data-testid="basemap-switcher"`, `data-testid="basemap-switcher-trigger"`,
  `role="menuitemradio"`, `aria-checked`, the selected-radio dot, `onChange` signature,
  the empty-catalog `return null` (`:64-66`), the absence of `role="menu"`.
- Popover width grows from `w-56` to `w-72`; add `max-h-[70vh] overflow-y-auto` so ~16 entries
  remain reachable at the 375×812 mobile viewport.

### 7. UI — `StylePicker.tsx`

Same grouping over the preset grid, same header treatment. `aria-label={basemap.name}`
and `aria-pressed` on each preset button are preserved.

### 8. i18n

One key per non-`custom` provider slug, in `en.json`, `pt.json`, `es.json`:

```
map.basemap.provider.carto
map.basemap.provider.esri
map.basemap.provider.google
map.basemap.provider.openstreetmap
map.basemap.provider.openfreemap
map.basemap.provider.opentopomap
map.basemap.provider.usgs
```

Values are proper nouns and stay untranslated across locales except where a locale
convention differs. Run `npm run extract-messages`; the i18n CI check must pass.

## Acceptance criteria (deterministic)

1. `imageryBasemapSchema` requires `provider`; `v.parse` **fails** for an entry without
   one, for both the `raster` and `style` variants.
2. Every `BASEMAP_CATALOG` entry validates, ids are unique, and every entry's
   `provider` appears in `PROVIDER_ORDER` (excluding `'custom'`).
3. Catalog has **≥12 entries across ≥4 providers**, and every existing entry id from
   `basemaps.ts:9-85` is still present with its id unchanged.
4. **Zero key-gated entries.** No catalog `url` matches
   `/\{apikey\}|\{key\}|api[_-]?key|access[_-]?token|\bsubscription-key\b/i`.
5. **Zero prohibited hosts.** No catalog URL hostname matches any of:
   `virtualearth.net`, `bing.com`, `mapbox.com`, `here.com`, `thunderforest.com`,
   `stadiamaps.com`, `wikimedia.org`, `googleapis.com`, `ggpht.com` (these last two:
   non-tile Google surfaces — tile entries use `mt{0-3}.google.com` only).
   (Regression guard for the removals this spec makes — this test is the reason a
   future agent cannot silently re-add them.)
6. **Zero unsupported placeholders.** No catalog URL contains `{quadkey}` or
   `{bbox-epsg-3857}`.
7. Every `raster` entry's hostname satisfies `isHostnameAllowed()`.
8. Every hostname added to `ALLOWED_HOSTNAMES` / `ALLOWED_HOSTNAME_PATTERNS` in this PR
   is used by at least one catalog entry, and no added pattern matches a hostname
   outside its provider's tile-serving zone.
9. `groupBasemapsByProvider` returns groups in exactly `PROVIDER_ORDER`, omits empty
   groups, preserves within-group declaration order, and excludes `'custom'`.
10. `BasemapSwitcher` renders one `role="group"` per non-empty provider, each with an
    accessible name equal to the localized provider label; `getAllByRole('group')`
    length equals the group count; `queryByRole('menu')` is still null.
11. Selecting an item still calls `onChange` with that entry's id; `aria-checked` is
    true on exactly one item.
12. The `basemapProviderSchema` options (excluding `'custom'`) and `PROVIDER_ORDER`
    are the same set, and every slug in that set has a `map.basemap.provider.<slug>`
    key present in **all three** of `en.json`, `pt.json`, `es.json` (asserted by
    iterating the schema picklist and cross-checking the order constant — no
    hardcoded list).
13. `node scripts/qa/verify-basemaps.mjs` exits 0 against the merged catalog.
14. `npm run lint:types`, `npm run lint:eslint`, `npm run lint:prettier`, `npm test`
    pass; `npm run test:coverage` holds ≥80% on all four metrics.
15. `visual-regression-check` is green with intentionally-updated baselines for the
    BasemapSwitcher stories, and **no** other baseline file changed byte-for-byte.
16. `docs/qa/376.md` exists and is linked from the PR body.
17. `StylePicker` renders the same provider grouping: one `role="group"` per
    non-empty provider with an accessible name equal to the localized provider label,
    and the custom-URL flow constructs a schema-valid basemap with
    `provider: 'custom'` that appears in no provider group.

## Required tests

`tests/unit/lib/schemas/imagery-source.test.ts`
- required `provider` rejected when absent (raster and style variants);
- unknown slug rejected; `'custom'` accepted.

`tests/unit/lib/map/basemaps.test.ts` (extend; keep all existing cases)
- AC 2, 3, 4, 5, 6, 7, 9;
- `findBasemap` fallback chain unchanged, including the empty-catalog throw;
- `DEFAULT_BASEMAP_ID` still resolves and its provider is first in `PROVIDER_ORDER`.

`tests/unit/lib/map/tile-hostname-allowlist.test.ts` (new)
- AC 8, plus explicit negative cases: `evil.google.com`, `x.virtualearth.net`,
  `notarcgisonline.com`, `arcgisonline.com.evil.tld` all return `false`.

`tests/unit/components/shared/MapContainer/BasemapSwitcher.test.tsx` (extend)
- AC 10, 11; every entry still reachable by visible name; grouped rendering with a
  single-provider catalog produces exactly one group.

`tests/unit/screens/MapScreen/StylePicker.test.tsx` (extend)
- grouped presets render; custom-URL flow still produces a schema-valid basemap with
  `provider: 'custom'`.

`tests/unit/i18n/` — AC 12, driven off the picklist.

Storybook: extend `BasemapSwitcher.stories.tsx` with a `GroupedByProvider` story
(`defaultOpen: true`) covering the full catalog. Keep `Default` and
`SatelliteSelected`.

The verification script is **not** a Vitest test — it makes real network calls and
must not run in the unit suite.

## QA — `docs/qa/376.md` (required before readiness is reported)

Must contain: scope validated; prerequisites (`npm ci`, Node ≥22); how to run
`scripts/qa/verify-basemaps.mjs` and how to read its output; per-provider entry list
with attribution string and licence/terms link; **the explicit exclusion table with
the reason and evidence date for each rejected provider** (Bing, Mapbox, HERE,
Thunderforest, Stadia/Stamen, Wikimedia, Esri legacy layers) **plus the Google
decision-log entry** (decision date, decision-maker, endpoints, live-verification
evidence, and the acknowledged ToS position); a statement that
the count of key-requiring providers is zero and which test enforces it; manual steps
at 1440×900 and 375×812 for opening the switcher, reading group headers, keyboard
traversal, and selecting an entry from a non-first group; expected results; explicit
failure conditions (a group with no header; an entry outside a group; a 403 from
`/api/tiles` during SMP download); cleanup (`git restore
screenshots/screenshot/` after any local screenshot run, per AGENTS.md); and known
limitations — third-party endpoints can disappear between CI runs, the orphan-role
`menuitemradio` debt, and the OSMF-prefetch concern tracked in its follow-up issue.

## Visual baselines

`visual-regression-check` is the blocking job. Generate baselines from CI, not
locally: run the PR, inspect the `visual-regression-diff` artifact, and take the
CI-rendered screenshots as canonical for the new/changed BasemapSwitcher stories.
Preserve every unrelated file under `tests/e2e/storybook-screenshots-baseline/`
byte-for-byte; if a local run rewrites unrelated baselines, restore them. Never relax
a threshold to hide cross-platform drift.

## Decision log

- **2026-09-08 — Google included** via keyless `mt{0-3}.google.com/vt` endpoints
  (QuickMapServices access model), by product-owner directive ("let's take the same
  direction as QuickMapServices"). The spec review had excluded Google citing Google
  Maps Platform ToS §3.2.3(a) ("No Scraping"); that position is recorded and the risk
  explicitly accepted by the product owner. Live verification 2026-09-08: `lyrs=s|m|y|p`
  all HTTP 200, `image/jpeg`/`image/png`, `access-control-allow-origin: *`; legacy
  `khms`/`kh` endpoint 404 (excluded). Bing, Stamen, Mapbox, HERE, Thunderforest and
  Wikimedia remain excluded. SMP offline packaging treats Google entries like any
  other raster entry; OSMF-policy concerns are tracked in #378.
- **2026-09-08 — rev3** from an independent pre-merge review (Google Antigravity CLI,
  `gemini-3.8-flash-high`): OpenFreeMap fully specified as `'openfreemap'` across
  schema, order, i18n and candidate table (style JSON live-verified 2026-09-08);
  StylePicker acceptance criterion added (AC 17); popover width pinned (`w-72`);
  AC 12 rewritten as a set-equality assertion; indent pinned (`pl-4`); stale
  cross-review reference removed from Hard-stop conditions.

## Hard-stop conditions

Stop and report rather than improvising if any of these occur:
- fewer than 4 candidates pass the verification gate — the grouping UI is not worth
  shipping over a catalog that did not grow;
- a candidate requires a proxy MIME type outside
  `functions/api/tiles/index.ts:263-269` (verified 2026-09-08: allowlist block spans
  :263-269, `application/octet-stream` also appears at :311 for a different surface) —
  that is a proxy change, out of scope;
- a candidate needs a placeholder `normalizeTileUrl` does not support — out of scope;
- a candidate needs an allowlist pattern broader than one tile-serving zone — do not
  widen the allowlist; narrow or drop the candidate (allowlist invariant in
  Current-code constraints and `functions/api/tiles/index.ts`);
- grouping cannot be added without changing `role="menuitemradio"` — stop and raise the
  a11y question rather than silently changing roles the tests pin.

## Implementation start conditions

1. This spec file is merged to `main`, and #376's body links the spec blob at the
   merged SHA.
2. `git log origin/main` confirms `src/lib/map/basemaps.ts`,
   `src/lib/schemas/imagery-source.ts`,
   `src/components/shared/MapContainer/BasemapSwitcher.tsx` and
   `src/lib/map/tile-hostname-allowlist.ts` are unchanged since `4080319`; if any
   changed, re-verify the "Current-code constraints" table first.
3. **`gh pr list --search 'basemap OR tile-hostname-allowlist'` returns no open PR
   touching those four files.** (This check could not be run when the spec was
   written — GitHub was unreachable from the authoring environment.)
4. `#376` carries `agent:ready-for-implementation` + `lane:implementation`.
