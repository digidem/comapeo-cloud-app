import {
  AUTHORED_RASTER_LAYER_FIXTURE,
  AUTHORED_VECTOR_LAYER_FIXTURE,
} from '@tests/fixtures/authored-layers';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import type { AuthoredLayer } from '@/lib/map/authored-layers';
import { MAX_AUTHORED_LAYERS } from '@/lib/map/authored-layers';
import { buildSavedMapAuthoringWrite } from '@/lib/map/saved-map-authoring';
import {
  type SavedMapAuthoringDraftFields,
  type SavedMapStorageRow,
  type ValidatedSavedMapStorageSnapshot,
  parseSavedMapForAuthoring,
  savedMapSchema,
} from '@/lib/schemas/saved-map';

describe('savedMapSchema', () => {
  const validRaster = {
    id: 'map-001',
    projectLocalId: 'proj-1',
    name: 'Territory Basemap',
    type: 'raster' as const,
    styleUrl: 'https://example.com/tiles/{z}/{x}/{y}.png',
    bbox: [-73.0, -3.5, -70.0, -1.0],
    minZoom: 0,
    maxZoom: 14,
    attribution: '© OpenStreetMap',
    scheme: 'xyz' as const,
    status: 'draft' as const,
    errorMessage: undefined,
    createdAt: '2026-06-28T00:00:00Z',
    updatedAt: '2026-06-28T00:00:00Z',
  };

  it('validates a complete raster saved map', () => {
    const result = v.safeParse(savedMapSchema, validRaster);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.name).toBe('Territory Basemap');
      expect(result.output.type).toBe('raster');
    }
  });

  it('accepts canonical authored layers and preserves their order', () => {
    const result = v.safeParse(savedMapSchema, {
      ...validRaster,
      layers: [AUTHORED_VECTOR_LAYER_FIXTURE],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.layers).toEqual([AUTHORED_VECTOR_LAYER_FIXTURE]);
    }
  });

  it('rejects duplicate authored-layer IDs in a complete SavedMap collection', () => {
    const result = v.safeParse(savedMapSchema, {
      ...validRaster,
      layers: [AUTHORED_VECTOR_LAYER_FIXTURE, AUTHORED_VECTOR_LAYER_FIXTURE],
    });
    expect(result.success).toBe(false);
  });

  it('returns the canonicalized authored layer produced by the shared parser', () => {
    const candidate = structuredClone(AUTHORED_VECTOR_LAYER_FIXTURE);
    const firstFragment = candidate.render.layers[0]!;
    candidate.render.layers[0] = {
      ...firstFragment,
      layout: {},
    };
    const result = v.safeParse(savedMapSchema, {
      ...validRaster,
      layers: [candidate],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.layers?.[0]?.render.layers[0]).not.toHaveProperty(
        'layout',
      );
    }
  });

  it('rejects a non-canonical authored layer through the strict shared validator', () => {
    const invalidLayer = {
      ...AUTHORED_VECTOR_LAYER_FIXTURE,
      id: 'not-a-canonical-uuid',
    };
    expect(
      v.safeParse(savedMapSchema, { ...validRaster, layers: [invalidLayer] })
        .success,
    ).toBe(false);
  });

  it('rejects more authored layers than the packaging boundary allows', () => {
    const layers = Array.from(
      { length: MAX_AUTHORED_LAYERS + 1 },
      (_, index) => ({
        ...AUTHORED_VECTOR_LAYER_FIXTURE,
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      }),
    );
    expect(
      v.safeParse(savedMapSchema, { ...validRaster, layers }).success,
    ).toBe(false);
  });

  it('rejects an oversized layers array before reflecting on any layer entry', () => {
    let reflectionCalls = 0;
    const hostileLayer = new Proxy(AUTHORED_VECTOR_LAYER_FIXTURE, {
      ownKeys(target) {
        reflectionCalls += 1;
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, property) {
        reflectionCalls += 1;
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
    });
    const layers = Array.from(
      { length: MAX_AUTHORED_LAYERS + 1 },
      () => hostileLayer,
    );

    expect(
      v.safeParse(savedMapSchema, { ...validRaster, layers }).success,
    ).toBe(false);
    expect(reflectionCalls).toBe(0);
  });

  it('rejects an authored-layer collection above the aggregate packaging JSON cap', () => {
    const layers = Array.from({ length: MAX_AUTHORED_LAYERS }, (_, index) => ({
      ...AUTHORED_VECTOR_LAYER_FIXTURE,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      name: 'x'.repeat(170_000),
    }));
    expect(
      v.safeParse(savedMapSchema, { ...validRaster, layers }).success,
    ).toBe(false);
  });

  it('keeps legacy maps without layers valid', () => {
    const result = v.safeParse(savedMapSchema, validRaster);
    expect(result.success).toBe(true);
    if (result.success) expect(result.output.layers).toBeUndefined();
  });

  it('validates a complete style saved map', () => {
    const result = v.safeParse(savedMapSchema, {
      ...validRaster,
      type: 'style',
      scheme: undefined,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a map missing a required field (name)', () => {
    const { name: _name, ...rest } = validRaster;
    expect(v.safeParse(savedMapSchema, rest).success).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(
      v.safeParse(savedMapSchema, { ...validRaster, name: '' }).success,
    ).toBe(false);
  });

  it('rejects an empty styleUrl for raster maps', () => {
    expect(
      v.safeParse(savedMapSchema, { ...validRaster, styleUrl: '' }).success,
    ).toBe(false);
  });

  it('allows an empty styleUrl only for ready imported-style records', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        type: 'style',
        scheme: undefined,
        origin: 'imported',
        styleUrl: '',
        status: 'ready',
      }).success,
    ).toBe(true);
  });

  it('rejects a ready empty styleUrl without explicit imported origin', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        type: 'style',
        scheme: undefined,
        styleUrl: '',
        status: 'ready',
      }).success,
    ).toBe(false);
  });

  it('rejects imported origin with a network styleUrl', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        type: 'style',
        scheme: undefined,
        origin: 'imported',
        styleUrl: 'https://example.com/style.json',
        status: 'ready',
      }).success,
    ).toBe(false);
  });

  it('rejects an empty styleUrl for non-ready style maps', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        type: 'style',
        scheme: undefined,
        styleUrl: '',
      }).success,
    ).toBe(false);
  });

  it('rejects a bbox with an extra entry (strictTuple)', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        bbox: [-73.0, -3.5, -70.0, -1.0, 0],
      }).success,
    ).toBe(false);
  });

  it('rejects a bbox with Infinity (v.finite)', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        bbox: [-73.0, -3.5, -70.0, Infinity],
      }).success,
    ).toBe(false);
  });

  it('rejects a bbox with -Infinity (v.finite)', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        bbox: [-Infinity, -3.5, -70.0, -1.0],
      }).success,
    ).toBe(false);
  });

  it('rejects a longitude outside [-180, 180] (west)', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        bbox: [-200.0, -3.5, -70.0, -1.0],
      }).success,
    ).toBe(false);
  });

  it('rejects a longitude outside [-180, 180] (east)', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        bbox: [-73.0, -3.5, 181.0, -1.0],
      }).success,
    ).toBe(false);
  });

  it('rejects a latitude outside [-90, 90]', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        bbox: [-73.0, -95.0, -70.0, -1.0],
      }).success,
    ).toBe(false);
  });

  it('rejects an inverted horizontal extent (west > east)', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        bbox: [-70.0, -3.5, -73.0, -1.0],
      }).success,
    ).toBe(false);
  });

  it('rejects an inverted vertical extent (south > north)', () => {
    // [-73, 10, -70, -10] is finite and in range and passes west <= east,
    // but south (10) > north (-10) — an inverted vertical extent that must
    // fail validation instead of misleading downstream map display.
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        bbox: [-73.0, 10.0, -70.0, -10.0],
      }).success,
    ).toBe(false);
  });

  it('rejects when minZoom > maxZoom', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        minZoom: 10,
        maxZoom: 5,
      }).success,
    ).toBe(false);
  });

  it('rejects an out-of-range zoom (maxZoom > 22)', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        maxZoom: 30,
      }).success,
    ).toBe(false);
  });

  it('rejects an invalid type', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        type: 'vector',
      }).success,
    ).toBe(false);
  });

  it('rejects an invalid status', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        status: 'unknown',
      }).success,
    ).toBe(false);
  });

  it('rejects an invalid scheme on a raster map', () => {
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        scheme: 'bogus',
      }).success,
    ).toBe(false);
  });

  it('ignores scheme when type is style (validated only for raster)', () => {
    // A style map with an out-of-range scheme still validates because scheme
    // is only validated for raster maps — it is stripped/ignored here.
    expect(
      v.safeParse(savedMapSchema, {
        ...validRaster,
        type: 'style',
        scheme: 'bogus',
      }).success,
    ).toBe(true);
  });

  it('does not require scheme on a raster map', () => {
    expect(
      v.safeParse(savedMapSchema, { ...validRaster, scheme: undefined })
        .success,
    ).toBe(true);
  });
});

describe('parseSavedMapForAuthoring', () => {
  const vectorLayer = () => structuredClone(AUTHORED_VECTOR_LAYER_FIXTURE);
  const rasterLayer = () => structuredClone(AUTHORED_RASTER_LAYER_FIXTURE);

  const authoredRow = (): SavedMapStorageRow => ({
    id: 'map-001',
    projectLocalId: 'proj-1',
    name: 'Territory Basemap',
    type: 'raster' as const,
    origin: 'authored' as const,
    styleUrl: 'https://example.com/tiles/{z}/{x}/{y}.png',
    bbox: [-73.0, -3.5, -70.0, -1.0],
    minZoom: 0,
    maxZoom: 14,
    attribution: '© OpenStreetMap',
    scheme: 'xyz' as const,
    status: 'ready' as const,
    createdAt: '2026-06-28T00:00:00Z',
    updatedAt: '2026-06-28T00:00:00Z',
    layers: [vectorLayer()],
  });

  it('rejects non-object input (null, array, primitive)', () => {
    for (const input of [null, undefined, 'map', 42, [], [authoredRow()]]) {
      const result = parseSavedMapForAuthoring(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SAVED_MAP_INVALID');
        expect(result.rawInput).toBe(input);
      }
    }
  });

  it('rejects dangerous own enumerable passthrough keys (__proto__, prototype, constructor)', () => {
    for (const key of ['__proto__', 'prototype', 'constructor'] as const) {
      // Computed keys in object literals create real own enumerable
      // properties (the literal `__proto__:` form would set the prototype
      // instead), which is exactly the crafted-shape the guard rejects.
      const crafted = { ...authoredRow(), [key]: { polluted: true } };
      const result = parseSavedMapForAuthoring(crafted);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SAVED_MAP_INVALID');
        expect(
          result.error.issues.some(
            (issue) => issue.path[0] === key && issue.path.length === 1,
          ),
        ).toBe(true);
      }
    }
  });

  it('does not reject rows merely inheriting Object.prototype members', () => {
    // The dangerous-key guard must only fire for OWN enumerable keys; every
    // normal row "has" constructor/hasOwnProperty via the prototype chain.
    const result = parseSavedMapForAuthoring(authoredRow());
    expect(result.ok).toBe(true);
  });

  it('succeeds on a valid authored row and mints the branded snapshot', () => {
    const input = authoredRow();
    const result = parseSavedMapForAuthoring(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The snapshot must preserve the EXACT original row object so later
    // writes can passthrough unknown keys value-identically.
    expect(result.snapshot.row).toBe(input);
    expect(result.map.name).toBe('Territory Basemap');
    expect(result.map.layers).toEqual([AUTHORED_VECTOR_LAYER_FIXTURE]);
    expect(result.layerEntries).toEqual([
      {
        status: 'valid',
        index: 0,
        layer: AUTHORED_VECTOR_LAYER_FIXTURE,
      },
    ]);
    expect(result.draftEntries).toEqual([
      {
        kind: 'valid',
        key: `layer:${AUTHORED_VECTOR_LAYER_FIXTURE.id}`,
        layer: AUTHORED_VECTOR_LAYER_FIXTURE,
      },
    ]);
  });

  it('treats a missing layers collection as empty', () => {
    const input = authoredRow();
    delete input.layers;
    const result = parseSavedMapForAuthoring(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layerEntries).toEqual([]);
    expect(result.draftEntries).toEqual([]);
    expect(result.map.layers).toEqual([]);
  });

  it('preserves invalid entries (raw + index) alongside valid siblings', () => {
    const corrupt = { schemaVersion: 1, id: 'not-a-uuid' };
    const input = authoredRow();
    input.layers = [vectorLayer(), corrupt, rasterLayer()];
    const result = parseSavedMapForAuthoring(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layerEntries).toHaveLength(3);
    expect(result.layerEntries[0]?.status).toBe('valid');
    expect(result.layerEntries[1]).toMatchObject({
      status: 'invalid',
      index: 1,
      raw: corrupt,
    });
    expect(result.layerEntries[2]?.status).toBe('valid');
    if (result.layerEntries[1]?.status !== 'invalid') return;
    expect(result.layerEntries[1].error.code).toBe('AUTHORED_LAYER_INVALID');
    expect(result.layerEntries[1].raw).toBe(corrupt);
    expect(result.draftEntries[1]).toMatchObject({
      kind: 'invalid',
      key: 'invalid:1',
      originalIndex: 1,
    });
    expect(result.map.layers).toEqual([
      AUTHORED_VECTOR_LAYER_FIXTURE,
      AUTHORED_RASTER_LAYER_FIXTURE,
    ]);
  });

  it('treats an unknown future layer schemaVersion as an invalid entry', () => {
    const future = { ...vectorLayer(), schemaVersion: 99 };
    const input = authoredRow();
    input.layers = [future];
    const result = parseSavedMapForAuthoring(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layerEntries[0]?.status).toBe('invalid');
    expect(result.draftEntries[0]?.kind).toBe('invalid');
    expect(result.map.layers).toEqual([]);
  });

  it('marks every duplicate-ID occurrence as an invalid recovery entry', () => {
    // Two individually-valid entries sharing one id must BOTH become invalid
    // recovery entries; a distinct sibling stays valid.
    const first = vectorLayer();
    const second = vectorLayer();
    const input = authoredRow();
    input.layers = [first, rasterLayer(), second];
    const result = parseSavedMapForAuthoring(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layerEntries.map((entry) => entry.status)).toEqual([
      'invalid',
      'valid',
      'invalid',
    ]);
    for (const index of [0, 2]) {
      const entry = result.layerEntries[index];
      expect(entry?.status).toBe('invalid');
      if (entry?.status !== 'invalid') return;
      expect(entry.raw).toBe(input.layers![index]);
      expect(entry.error.issues[0]).toMatchObject({
        path: ['id'],
        code: 'duplicate-id',
      });
    }
    expect(result.map.layers).toEqual([AUTHORED_RASTER_LAYER_FIXTURE]);
    expect(result.draftEntries.map((entry) => entry.key)).toEqual([
      'invalid:0',
      `layer:${AUTHORED_RASTER_LAYER_FIXTURE.id}`,
      'invalid:2',
    ]);
    // No valid draft entry may ever carry the duplicated id.
    expect(
      result.draftEntries.some(
        (entry) =>
          entry.kind === 'valid' &&
          entry.key === `layer:${AUTHORED_VECTOR_LAYER_FIXTURE.id}`,
      ),
    ).toBe(false);
  });

  it('rejects imported rows as not authorable and never mints a snapshot', () => {
    const input = {
      ...authoredRow(),
      type: 'style' as const,
      styleUrl: '',
      scheme: undefined,
      origin: 'imported' as const,
      status: 'ready' as const,
    };
    const result = parseSavedMapForAuthoring(input);
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'SAVED_MAP_NOT_AUTHORABLE' },
    });
    expect((result as { snapshot?: unknown }).snapshot).toBeUndefined();
  });

  it('rejects a non-Blob smpBlob at runtime', () => {
    const result = parseSavedMapForAuthoring({
      ...authoredRow(),
      smpBlob: 'not-a-blob',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SAVED_MAP_INVALID');
      expect(
        result.error.issues.some((issue) => issue.path[0] === 'smpBlob'),
      ).toBe(true);
    }
  });

  it('rejects a negative or non-finite smpSize at runtime', () => {
    for (const smpSize of [-1, Infinity, '12']) {
      const result = parseSavedMapForAuthoring({ ...authoredRow(), smpSize });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SAVED_MAP_INVALID');
        expect(
          result.error.issues.some((issue) => issue.path[0] === 'smpSize'),
        ).toBe(true);
      }
    }
  });

  it('accepts a real Blob smpBlob with a finite non-negative smpSize', () => {
    const blob = new Blob(['smp-bytes']);
    const result = parseSavedMapForAuthoring({
      ...authoredRow(),
      smpBlob: blob,
      smpSize: 9,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a malformed outer field with a path-carrying issue', () => {
    const result = parseSavedMapForAuthoring({
      ...authoredRow(),
      bbox: [-73.0, -3.5, -70.0],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SAVED_MAP_INVALID');
      expect(
        result.error.issues.some((issue) => issue.path[0] === 'bbox'),
      ).toBe(true);
    }
  });

  it('rejects a malformed non-layer field without touching layers parsing', () => {
    const result = parseSavedMapForAuthoring({
      ...authoredRow(),
      name: '',
    });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error.code).toBe('SAVED_MAP_INVALID');
  });

  it('preserves unknown passthrough fields and runtime package fields on the snapshot row', () => {
    const blob = new Blob(['smp-bytes']);
    const input = {
      ...authoredRow(),
      futureField: { x: 1 },
      smpBlob: blob,
      smpSize: 9,
    };
    const result = parseSavedMapForAuthoring(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.row.futureField).toEqual({ x: 1 });
    expect(result.snapshot.row.smpBlob).toBe(blob);
    expect(result.snapshot.row.smpSize).toBe(9);
  });
});

describe('buildSavedMapAuthoringWrite', () => {
  const NOW = Date.parse('2026-07-01T00:00:00Z');
  const vectorLayer = () => structuredClone(AUTHORED_VECTOR_LAYER_FIXTURE);
  const rasterLayer = () => structuredClone(AUTHORED_RASTER_LAYER_FIXTURE);

  const packagedRow = (
    layers: unknown[] = [vectorLayer()],
  ): SavedMapStorageRow => ({
    id: 'map-001',
    projectLocalId: 'proj-1',
    name: 'Territory Basemap',
    type: 'raster' as const,
    origin: 'authored' as const,
    styleUrl: 'https://example.com/tiles/{z}/{x}/{y}.png',
    bbox: [-73.0, -3.5, -70.0, -1.0],
    minZoom: 0,
    maxZoom: 14,
    scheme: 'xyz' as const,
    status: 'ready' as const,
    errorMessage: 'stale message',
    smpBlob: new Blob(['smp-bytes']),
    smpSize: 9,
    createdAt: '2026-06-28T00:00:00Z',
    updatedAt: '2026-06-28T00:00:00Z',
    layers,
  });

  const baseDraft = (): SavedMapAuthoringDraftFields => ({
    name: 'Territory Basemap',
    type: 'raster',
    styleUrl: 'https://example.com/tiles/{z}/{x}/{y}.png',
    bbox: [-73.0, -3.5, -70.0, -1.0],
    minZoom: 0,
    maxZoom: 14,
    scheme: 'xyz',
  });

  const snapshotFor = (row: unknown): ValidatedSavedMapStorageSnapshot => {
    const parsed = parseSavedMapForAuthoring(row);
    if (!parsed.ok) {
      throw new Error(`fixture row failed to parse: ${parsed.error.code}`);
    }
    return parsed.snapshot;
  };

  const write = (args?: {
    row?: ReturnType<typeof packagedRow>;
    draft?: SavedMapAuthoringDraftFields;
    layers?: AuthoredLayer[];
    updatedAt?: number;
  }) =>
    buildSavedMapAuthoringWrite(
      snapshotFor(args?.row ?? packagedRow()),
      args?.draft ?? baseDraft(),
      args?.layers ?? [vectorLayer()],
      args?.updatedAt ?? NOW,
    );

  it('refuses plain unbranded rows (runtime guard and type-level brand)', () => {
    const plainRow =
      packagedRow() as unknown as ValidatedSavedMapStorageSnapshot;
    expect(() =>
      buildSavedMapAuthoringWrite(plainRow, baseDraft(), [], NOW),
    ).toThrow(/snapshot/i);
    // The brand is also nominal at the type level: a raw row lacks the
    // module-private marker property and must not be assignable.
    // @ts-expect-error a storage row is not a ValidatedSavedMapStorageSnapshot
    const unbranded: ValidatedSavedMapStorageSnapshot = packagedRow();
    void unbranded;
  });

  it('defensively refuses imported snapshots even if handed a forged brand', () => {
    const importedRow = {
      ...packagedRow(),
      type: 'style' as const,
      styleUrl: '',
      scheme: undefined,
      origin: 'imported' as const,
    };
    // Forge the full snapshot shape so the runtime brand guard passes and the
    // origin check is what has to catch the forged input.
    const forged = {
      row: importedRow,
    } as unknown as ValidatedSavedMapStorageSnapshot;
    expect(() =>
      buildSavedMapAuthoringWrite(
        forged,
        {
          ...baseDraft(),
          type: 'style',
          styleUrl: 'https://example.com/s.json',
        },
        [],
        NOW,
      ),
    ).toThrow(/imported/i);
  });

  it('rejects extra draft keys smuggled through a cast', () => {
    for (const extra of [{ status: 'ready' }, { smpBlob: new Blob(['x']) }]) {
      expect(() =>
        write({
          draft: { ...baseDraft(), ...extra } as SavedMapAuthoringDraftFields,
        }),
      ).toThrow();
    }
  });

  it('rejects invalid draft fields and non-finite updatedAt', () => {
    expect(() =>
      write({
        draft: {
          ...baseDraft(),
          bbox: [-73.0, -3.5, -70.0] as unknown as [
            number,
            number,
            number,
            number,
          ],
        },
      }),
    ).toThrow();
    expect(() => write({ draft: { ...baseDraft(), name: '' } })).toThrow();
    expect(() => write({ updatedAt: Number.NaN })).toThrow();
    expect(() =>
      write({ updatedAt: '2026-07-01' as unknown as number }),
    ).toThrow();
  });

  it('preserves package lifecycle on a name-only change', () => {
    const row = packagedRow();
    const result = write({
      row,
      draft: { ...baseDraft(), name: 'Renamed Basemap' },
    });
    expect(result.status).toBe('ready');
    expect(result.smpBlob).toBe(row.smpBlob);
    expect(result.smpSize).toBe(9);
    expect(result.errorMessage).toBe('stale message');
    expect(result.name).toBe('Renamed Basemap');
    expect(result.updatedAt).toBe(new Date(NOW).toISOString());
  });

  it('preserves package lifecycle on a legacy row without a layers key', () => {
    const row = packagedRow();
    delete row.layers;
    const result = write({
      row,
      draft: { ...baseDraft(), name: 'Renamed' },
      layers: [],
    });
    expect(result.status).toBe('ready');
    expect(result.smpBlob).toBe(row.smpBlob);
    expect(result.smpSize).toBe(9);
    // Canonical writes always materialize layers, even when the stored row
    // predated the field.
    expect(result.layers).toEqual([]);
  });

  it('drops package lifecycle for every package-relevant field change', () => {
    const reorderedStored = [vectorLayer(), rasterLayer()];
    const visibilityChanged = { ...vectorLayer(), visible: true };
    const styledChanged = structuredClone(vectorLayer());
    styledChanged.render.layers[0]!.paint!['fill-color'] = '#04145C';
    const cases: {
      label: string;
      row?: ReturnType<typeof packagedRow>;
      draft?: SavedMapAuthoringDraftFields;
      layers?: AuthoredLayer[];
    }[] = [
      {
        label: 'type',
        draft: {
          ...baseDraft(),
          type: 'style',
          styleUrl: 'https://example.com/style.json',
          scheme: undefined,
        },
      },
      {
        label: 'styleUrl',
        draft: {
          ...baseDraft(),
          styleUrl: 'https://other.example/{z}/{x}/{y}.png',
        },
      },
      {
        label: 'bbox',
        draft: { ...baseDraft(), bbox: [-72.0, -3.5, -70.0, -1.0] },
      },
      { label: 'minZoom', draft: { ...baseDraft(), minZoom: 2 } },
      { label: 'maxZoom', draft: { ...baseDraft(), maxZoom: 16 } },
      {
        label: 'attribution absent→value',
        draft: { ...baseDraft(), attribution: '© New Attribution' },
      },
      { label: 'scheme', draft: { ...baseDraft(), scheme: 'tms' } },
      { label: 'layers add', layers: [vectorLayer(), rasterLayer()] },
      { label: 'layers remove', layers: [] },
      {
        label: 'layers reorder',
        row: packagedRow(reorderedStored),
        layers: [rasterLayer(), vectorLayer()],
      },
      { label: 'layer visibility', layers: [visibilityChanged] },
      { label: 'layer style', layers: [styledChanged] },
    ];
    for (const testCase of cases) {
      const result = write(testCase);
      expect(result.status, testCase.label).toBe('draft');
      expect('smpBlob' in result, testCase.label).toBe(false);
      expect('smpSize' in result, testCase.label).toBe(false);
      expect('errorMessage' in result, testCase.label).toBe(false);
      expect(result.smpBlob, testCase.label).toBeUndefined();
    }
  });

  it('persists a restyled layer under the same stable id without creating a duplicate', () => {
    const original = vectorLayer();
    const restyled = structuredClone(original);
    restyled.render.layers[0]!.paint!['fill-color'] = '#E45D2A';

    const result = write({
      row: packagedRow([original]),
      layers: [restyled],
    });

    expect(result.layers).toHaveLength(1);
    if (!result.layers) throw new Error('authoring writes must emit layers');
    expect(result.layers[0]?.id).toBe(original.id);
    expect(result.layers[0]?.render.layers[0]?.paint?.['fill-color']).toBe(
      '#E45D2A',
    );
    expect(result.status).toBe('draft');
    expect(result.smpBlob).toBeUndefined();
    expect(result.smpSize).toBeUndefined();
  });

  it('treats a stored invalid/future layer entry as a package-relevant change', () => {
    // The stored package was built from a layers collection that can no
    // longer round-trip, so preserving its lifecycle would lie about what is
    // inside the smp package.
    const row = packagedRow([
      vectorLayer(),
      { schemaVersion: 99, id: 'future-entry' },
    ]);
    const result = write({ row, draft: { ...baseDraft(), name: 'Renamed' } });
    expect(result.status).toBe('draft');
    expect('smpBlob' in result).toBe(false);
  });

  it('treats nested key order as irrelevant to package relevance', () => {
    const stored = vectorLayer();
    const reordered = vectorLayer();
    if (
      stored.source.type !== 'geojson' ||
      reordered.source.type !== 'geojson'
    ) {
      throw new Error('vector fixture must use a geojson source');
    }
    stored.source.data.features[0]!.properties = {
      name: 'polygon-area',
      extra: 1,
    };
    reordered.source.data.features[0]!.properties = {
      extra: 1,
      name: 'polygon-area',
    };
    const row = packagedRow([stored]);
    const result = write({ row, layers: [reordered] });
    expect(result.status).toBe('ready');
    expect(result.smpBlob).toBe(row.smpBlob);
  });

  it('copies immutable identity from the snapshot row', () => {
    const result = write();
    expect(result.id).toBe('map-001');
    expect(result.projectLocalId).toBe('proj-1');
    expect(result.origin).toBe('authored');
    expect(result.createdAt).toBe('2026-06-28T00:00:00Z');
  });

  it('preserves unknown passthrough keys value-identically', () => {
    const row = { ...packagedRow(), futureField: { x: 1 } };
    const result = write({ row });
    expect(result.futureField).toEqual({ x: 1 });
  });

  it('omits attribution and scheme keys when the draft leaves them undefined', () => {
    const draft = baseDraft();
    delete draft.scheme;
    const result = write({ draft });
    expect('attribution' in result).toBe(false);
    expect('scheme' in result).toBe(false);
  });

  it('writes attribution and scheme when the draft defines them', () => {
    const result = write({
      draft: { ...baseDraft(), attribution: '© Contributors', scheme: 'tms' },
    });
    expect(result.attribution).toBe('© Contributors');
    expect(result.scheme).toBe('tms');
  });

  it('produces structurally stable identical saves', () => {
    const draft = baseDraft();
    const layers = [vectorLayer()];
    const first = write({ draft, layers });
    const reparsed = parseSavedMapForAuthoring(first);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    const second = buildSavedMapAuthoringWrite(
      reparsed.snapshot,
      draft,
      layers,
      NOW,
    );
    // JSON equality proves no absent/null key oscillation between writes.
    expect(JSON.parse(JSON.stringify(second))).toEqual(
      JSON.parse(JSON.stringify(first)),
    );
    expect(Object.keys(second)).toEqual(Object.keys(first));
  });
});
