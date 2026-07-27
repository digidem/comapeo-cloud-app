import { describe, expect, it } from 'vitest';

import type { PresetLike } from '@/lib/categories/latest-set';
import { selectLatestCategorySet } from '@/lib/categories/latest-set';

function p(overrides: Partial<PresetLike> = {}): PresetLike {
  return {
    docId: `preset-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: '2025-01-01T00:00:00Z',
    deleted: false,
    ...overrides,
  };
}

describe('selectLatestCategorySet', () => {
  // ---- Single cluster passthrough ----

  it('returns all presets when they form a single cluster (passthrough)', () => {
    const presets = [
      p({ docId: 'a', createdAt: '2025-01-01T00:05:00Z' }),
      p({ docId: 'b', createdAt: '2025-01-01T00:03:00Z' }),
      p({ docId: 'c', createdAt: '2025-01-01T00:01:00Z' }),
      p({ docId: 'd', createdAt: '2025-01-01T00:00:00Z' }),
    ];

    const result = selectLatestCategorySet(presets);

    expect(result).toHaveLength(4);
    expect(result.map((r) => r.docId).sort()).toEqual(
      ['a', 'b', 'c', 'd'].sort(),
    );
  });

  // ---- Two well-separated clusters ----

  it('picks only the newest cluster when two clusters are well-separated', () => {
    // Newest cluster: within 30 min of each other (~2025-06)
    const newest = [
      p({ docId: 'n1', createdAt: '2025-06-15T12:00:00Z' }),
      p({ docId: 'n2', createdAt: '2025-06-15T12:30:00Z' }),
    ];

    // Old cluster: hours apart (~2025-01)
    const old = [
      p({ docId: 'o1', createdAt: '2025-01-01T00:00:00Z' }),
      p({ docId: 'o2', createdAt: '2025-01-01T00:10:00Z' }),
    ];

    const result = selectLatestCategorySet([...newest, ...old]);

    expect(result).toHaveLength(2);
    const ids = result.map((r) => r.docId).sort();
    expect(ids).toEqual(['n1', 'n2']);
  });

  // ---- Boundary-exact gap ----

  it('splits into two clusters at the exact threshold', () => {
    const HOUR_MS = 60 * 60 * 1000;

    const presets = [
      p({ docId: 'within', createdAt: '2025-01-01T01:00:00Z' }),
      p({ docId: 'at-boundary', createdAt: '2025-01-01T00:00:00Z' }),
    ];

    // Use HOUR_MS as custom gap. The gap is exactly HOUR_MS, which is ≤ gapMs,
    // so both should be in the same cluster.
    const resultSame = selectLatestCategorySet(presets, HOUR_MS);
    expect(resultSame.map((r) => r.docId).sort()).toEqual(
      ['at-boundary', 'within'].sort(),
    );

    // With gapMs = HOUR_MS - 1, the boundary exceeds, so they split.
    const resultSplit = selectLatestCategorySet(presets, HOUR_MS - 1);
    expect(resultSplit).toHaveLength(1);
    expect(resultSplit[0]!.docId).toBe('within');
  });

  // ---- Unparseable / missing createdAt ----

  it('excludes presets with unparseable createdAt from the latest set', () => {
    const presets = [
      p({ docId: 'valid', createdAt: '2025-01-01T00:00:00Z' }),
      p({ docId: 'bad-date', createdAt: 'not-a-date' }),
      p({ docId: 'empty-date', createdAt: '' }),
      p({ docId: 'valid2', createdAt: '2025-01-01T00:01:00Z' }),
    ];

    const result = selectLatestCategorySet(presets);

    const ids = result.map((r) => r.docId).sort();
    // Only the two with valid dates should be present
    expect(ids).toEqual(['valid', 'valid2']);
  });

  // ---- Empty input ----

  it('returns an empty array for empty input', () => {
    expect(selectLatestCategorySet([])).toEqual([]);
  });

  // ---- All presets deleted ----

  it('returns empty when all presets are deleted', () => {
    const presets = [
      p({ docId: 'd1', deleted: true }),
      p({ docId: 'd2', deleted: true }),
    ];

    expect(selectLatestCategorySet(presets)).toEqual([]);
  });

  // ---- All presets same timestamp ----

  it('treats presets with identical timestamps as one cluster', () => {
    const sameTime = '2025-03-15T10:00:00Z';
    const presets = [
      p({ docId: 'a', createdAt: sameTime }),
      p({ docId: 'b', createdAt: sameTime }),
      p({ docId: 'c', createdAt: sameTime }),
    ];

    const result = selectLatestCategorySet(presets);

    expect(result).toHaveLength(3);
  });

  // ---- Mixed deleted and non-deleted ----

  it('filters out deleted presets before clustering', () => {
    const newest = [
      p({ docId: 'keep', createdAt: '2025-06-15T12:00:00Z' }),
      p({
        docId: 'ignore-deleted',
        createdAt: '2025-06-15T12:00:00Z',
        deleted: true,
      }),
    ];

    const old = [p({ docId: 'old', createdAt: '2024-01-01T00:00:00Z' })];

    const result = selectLatestCategorySet([...newest, ...old]);

    expect(result).toHaveLength(1);
    expect(result[0]!.docId).toBe('keep');
  });

  // ---- Single preset ----

  it('returns the single preset when only one non-deleted preset exists', () => {
    const presets = [p({ docId: 'only', createdAt: '2025-01-01T00:00:00Z' })];
    const result = selectLatestCategorySet(presets);
    expect(result).toHaveLength(1);
    expect(result[0]!.docId).toBe('only');
  });

  // ---- Three clusters, pick newest ----

  it('returns only the newest cluster when three clusters exist', () => {
    const twoHoursMs = 2 * 60 * 60 * 1000;
    const presets = [
      // Cluster 3 - newest
      p({ docId: 'c3-a', createdAt: '2025-12-01T12:00:00Z' }),
      p({ docId: 'c3-b', createdAt: '2025-12-01T12:30:00Z' }),
      // Cluster 2 - 3 hours before
      p({ docId: 'c2-a', createdAt: '2025-12-01T09:00:00Z' }),
      p({ docId: 'c2-b', createdAt: '2025-12-01T09:20:00Z' }),
      // Cluster 1 - oldest, 3 more hours before
      p({ docId: 'c1-a', createdAt: '2025-12-01T06:00:00Z' }),
    ];

    const result = selectLatestCategorySet(presets, twoHoursMs);
    const ids = result.map((r) => r.docId).sort();
    expect(ids).toEqual(['c3-a', 'c3-b']);
  });

  // ---- Order preservation ----

  it('preserves original input order within the latest cluster', () => {
    const presets = [
      p({ docId: 'a', createdAt: '2025-06-15T12:00:00Z' }),
      p({ docId: 'b', createdAt: '2025-06-15T12:30:00Z' }),
      p({ docId: 'c', createdAt: '2025-06-15T12:15:00Z' }),
      p({ docId: 'old', createdAt: '2025-01-01T00:00:00Z' }),
    ];

    const result = selectLatestCategorySet(presets);

    // The latest cluster contains a, b, c (all within 60 min of each other).
    // The result should preserve the original input order: a, b, c — NOT the
    // sorted (newest-first) order: b, c, a.
    expect(result.map((r) => r.docId)).toEqual(['a', 'b', 'c']);
  });

  it('preserves original input order when all presets form a single cluster', () => {
    const presets = [
      p({ docId: 'd', createdAt: '2025-01-01T00:00:00Z' }),
      p({ docId: 'a', createdAt: '2025-01-01T00:05:00Z' }),
      p({ docId: 'c', createdAt: '2025-01-01T00:01:00Z' }),
      p({ docId: 'b', createdAt: '2025-01-01T00:03:00Z' }),
    ];

    const result = selectLatestCategorySet(presets);

    // All within 60 min — single cluster. Order should match input: d, a, c, b.
    expect(result.map((r) => r.docId)).toEqual(['d', 'a', 'c', 'b']);
  });
});
