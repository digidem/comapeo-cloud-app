import {
  AUTHORED_RASTER_LAYER_FIXTURE,
  AUTHORED_VECTOR_LAYER_FIXTURE,
} from '@tests/fixtures/authored-layers';
import { describe, expect, it } from 'vitest';

import type { AuthoredLayer } from '@/lib/map/authored-layers';
import {
  buildAuthoredLayerCommitContext,
  extractCanonicalAuthoredLayers,
  getAdvancedEditorRecoveryEligibility,
  validateAuthoredLayerDraftContext,
} from '@/lib/map/saved-map-authoring';
import type {
  AuthoredLayerDraftEntry,
  SavedMapAuthoringDraftFields,
} from '@/lib/schemas/saved-map';

describe('saved-map authoring draft helpers', () => {
  const vectorLayer = () => structuredClone(AUTHORED_VECTOR_LAYER_FIXTURE);
  const rasterLayer = () => structuredClone(AUTHORED_RASTER_LAYER_FIXTURE);

  const draftFields = (): SavedMapAuthoringDraftFields => ({
    name: 'Territory Basemap',
    type: 'raster',
    styleUrl: 'https://tiles.example.com/{z}/{x}/{y}.png',
    bbox: [-73.0, -3.5, -70.0, -1.0],
    minZoom: 0,
    maxZoom: 14,
  });

  const validEntry = (layer: AuthoredLayer): AuthoredLayerDraftEntry => ({
    kind: 'valid',
    key: `layer:${layer.id}`,
    layer,
  });

  const invalidEntry = (originalIndex: number): AuthoredLayerDraftEntry => ({
    kind: 'invalid',
    key: `invalid:${originalIndex}`,
    originalIndex,
    raw: { schemaVersion: 1, id: 'future-entry' },
    error: {
      code: 'AUTHORED_LAYER_INVALID',
      issues: [
        {
          path: ['schemaVersion'],
          code: 'UNSUPPORTED_SCHEMA_VERSION',
          message: 'future schema version',
        },
      ],
    },
  });

  /** Raster layer whose source zoom ceiling does not overlap 10..14. */
  const zoomConflictedRaster = (): AuthoredLayer => {
    const layer = rasterLayer();
    if (layer.source.type !== 'raster-tiles') {
      throw new Error('raster fixture must use a raster-tiles source');
    }
    return { ...layer, source: { ...layer.source, minZoom: 0, maxZoom: 5 } };
  };

  describe('buildAuthoredLayerCommitContext', () => {
    it('reserves every current valid draft id in append mode', () => {
      const context = buildAuthoredLayerCommitContext(
        draftFields(),
        [validEntry(vectorLayer()), validEntry(rasterLayer())],
        { kind: 'append' },
      );
      expect(context.minZoom).toBe(0);
      expect(context.maxZoom).toBe(14);
      expect(context.reservedIds?.size).toBe(2);
      expect(context.reservedIds?.has(AUTHORED_VECTOR_LAYER_FIXTURE.id)).toBe(
        true,
      );
      expect(context.reservedIds?.has(AUTHORED_RASTER_LAYER_FIXTURE.id)).toBe(
        true,
      );
    });

    it('reserves every valid id except the retained one in edit mode', () => {
      const context = buildAuthoredLayerCommitContext(
        draftFields(),
        [validEntry(vectorLayer()), validEntry(rasterLayer())],
        { kind: 'edit', retainedId: AUTHORED_VECTOR_LAYER_FIXTURE.id },
      );
      expect(context.reservedIds?.size).toBe(1);
      expect(context.reservedIds?.has(AUTHORED_VECTOR_LAYER_FIXTURE.id)).toBe(
        false,
      );
      expect(context.reservedIds?.has(AUTHORED_RASTER_LAYER_FIXTURE.id)).toBe(
        true,
      );
    });

    it('keeps every valid id reserved when the retained id is unknown', () => {
      const context = buildAuthoredLayerCommitContext(
        draftFields(),
        [validEntry(vectorLayer())],
        { kind: 'edit', retainedId: '00000000-0000-4000-8000-000000000000' },
      );
      expect(context.reservedIds?.size).toBe(1);
    });

    it('reserves nothing in extract mode', () => {
      const context = buildAuthoredLayerCommitContext(
        draftFields(),
        [validEntry(vectorLayer()), validEntry(rasterLayer())],
        { kind: 'extract' },
      );
      expect(context.reservedIds?.size).toBe(0);
      expect(context.reservedIds?.has(AUTHORED_VECTOR_LAYER_FIXTURE.id)).toBe(
        false,
      );
    });

    it('sources zooms from the current draft fields', () => {
      const draft = { ...draftFields(), minZoom: 10, maxZoom: 20 };
      const context = buildAuthoredLayerCommitContext(draft, [], {
        kind: 'extract',
      });
      expect(context.minZoom).toBe(10);
      expect(context.maxZoom).toBe(20);
    });
  });

  describe('validateAuthoredLayerDraftContext', () => {
    it('returns an empty map when every valid entry commits cleanly', () => {
      const context = buildAuthoredLayerCommitContext(
        draftFields(),
        [validEntry(vectorLayer())],
        { kind: 'extract' },
      );
      const errors = validateAuthoredLayerDraftContext(
        [validEntry(vectorLayer()), validEntry(rasterLayer())],
        context,
      );
      expect(errors.size).toBe(0);
    });

    it('keys raster effective-zoom failures by the draft entry key', () => {
      const conflicted = zoomConflictedRaster();
      const errors = validateAuthoredLayerDraftContext(
        [validEntry(conflicted)],
        { minZoom: 10, maxZoom: 14 },
      );
      expect(errors.size).toBe(1);
      expect([...errors.keys()]).toEqual([`layer:${conflicted.id}`]);
      expect(
        errors
          .get(`layer:${conflicted.id}`)
          ?.issues.some(
            (issue) => issue.code === 'EMPTY_RASTER_EFFECTIVE_ZOOM_RANGE',
          ),
      ).toBe(true);
    });

    it('ignores invalid recovery entries', () => {
      const errors = validateAuthoredLayerDraftContext(
        [invalidEntry(0), validEntry(vectorLayer())],
        { minZoom: 0, maxZoom: 14 },
      );
      expect(errors.size).toBe(0);
    });

    it('reports reserved-id collisions coming from the commit context', () => {
      const collision = {
        ...rasterLayer(),
        id: AUTHORED_VECTOR_LAYER_FIXTURE.id,
      };
      const context = buildAuthoredLayerCommitContext(
        draftFields(),
        [validEntry(vectorLayer())],
        { kind: 'append' },
      );
      const errors = validateAuthoredLayerDraftContext(
        [validEntry(collision)],
        context,
      );
      expect(errors.size).toBe(1);
      expect(
        errors
          .get(`layer:${AUTHORED_VECTOR_LAYER_FIXTURE.id}`)
          ?.issues.some((issue) => issue.code === 'ID_COLLISION_RESERVED'),
      ).toBe(true);
    });
  });

  describe('extractCanonicalAuthoredLayers', () => {
    it('refuses extraction while invalid recovery entries are retained', () => {
      const entries = [
        invalidEntry(0),
        validEntry(vectorLayer()),
        invalidEntry(2),
      ];
      const result = extractCanonicalAuthoredLayers(entries, {
        minZoom: 0,
        maxZoom: 14,
      });
      expect(result).toMatchObject({ ok: false, kind: 'recovery' });
      if (!result.ok && result.kind === 'recovery') {
        expect(result.errors.map((error) => error.key)).toEqual([
          'invalid:0',
          'invalid:2',
        ]);
      }
    });

    it('reports context failures before batch canonicalization', () => {
      const conflicted = zoomConflictedRaster();
      const result = extractCanonicalAuthoredLayers([validEntry(conflicted)], {
        minZoom: 10,
        maxZoom: 14,
      });
      expect(result).toMatchObject({ ok: false, kind: 'context' });
      if (!result.ok && result.kind === 'context') {
        expect(result.errors.map((error) => error.key)).toEqual([
          `layer:${conflicted.id}`,
        ]);
      }
    });

    it('maps batch duplicate-id failures back to draft keys', () => {
      // The parser guarantees unique valid draft keys, so a duplicate can only
      // exist in a crafted in-memory draft. #279's batch flags the second
      // occurrence of the pair, so exactly one indexed error comes back.
      const duplicate = vectorLayer();
      const entries = [validEntry(vectorLayer()), validEntry(duplicate)];
      const result = extractCanonicalAuthoredLayers(entries, {
        minZoom: 0,
        maxZoom: 14,
      });
      expect(result).toMatchObject({ ok: false, kind: 'canonical' });
      if (!result.ok && result.kind === 'canonical') {
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]?.index).toBe(1);
        expect(result.errors[0]?.key).toBe(
          `layer:${AUTHORED_VECTOR_LAYER_FIXTURE.id}`,
        );
        expect(
          result.errors[0]?.error.issues.some(
            (issue) => issue.code === 'DUPLICATE_ID_WITHIN_BATCH',
          ),
        ).toBe(true);
      }
    });

    it('returns canonical layers in the current draft entry order', () => {
      const entries = [validEntry(rasterLayer()), validEntry(vectorLayer())];
      const result = extractCanonicalAuthoredLayers(entries, {
        minZoom: 0,
        maxZoom: 14,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.layers.map((layer) => layer.id)).toEqual([
          AUTHORED_RASTER_LAYER_FIXTURE.id,
          AUTHORED_VECTOR_LAYER_FIXTURE.id,
        ]);
      }
    });
  });

  describe('getAdvancedEditorRecoveryEligibility', () => {
    it('allows recovery editing when every entry is valid', () => {
      expect(
        getAdvancedEditorRecoveryEligibility([
          validEntry(vectorLayer()),
          validEntry(rasterLayer()),
        ]),
      ).toEqual({ allowed: true });
    });

    it('blocks recovery editing while invalid entries exist, in draft order', () => {
      const eligibility = getAdvancedEditorRecoveryEligibility([
        invalidEntry(0),
        validEntry(vectorLayer()),
        invalidEntry(2),
      ]);
      expect(eligibility).toMatchObject({
        allowed: false,
        code: 'INVALID_RECOVERY_ENTRIES',
      });
      if (!eligibility.allowed) {
        expect(eligibility.keys).toEqual(['invalid:0', 'invalid:2']);
      }
    });

    it('is unaffected by valid-entry reordering', () => {
      expect(
        getAdvancedEditorRecoveryEligibility([
          validEntry(rasterLayer()),
          validEntry(vectorLayer()),
        ]),
      ).toEqual({ allowed: true });
      expect(
        getAdvancedEditorRecoveryEligibility([
          validEntry(vectorLayer()),
          validEntry(rasterLayer()),
        ]),
      ).toEqual({ allowed: true });
    });
  });
});
