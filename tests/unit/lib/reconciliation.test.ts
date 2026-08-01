import { describe, expect, it } from 'vitest';

import { planReconciliation } from '@/lib/reconciliation';

interface Row {
  localId: string;
  deleted: boolean;
  updatedAt: string;
}

const existing: Row[] = [
  { localId: 'kept', deleted: false, updatedAt: '2024-01-01T00:00:00Z' },
  { localId: 'omitted', deleted: false, updatedAt: '2024-01-01T00:00:00Z' },
];

describe('planReconciliation', () => {
  it.each([
    ['snapshot', true, 1, 0],
    ['delta', false, 0, 1],
    ['tombstone-stream', false, 0, 1],
  ] as const)(
    '%s omission semantics',
    (mode, omittedDeleted, tombstoned, preserved) => {
      const result = planReconciliation({
        existing,
        incoming: [
          {
            localId: 'kept',
            deleted: false,
            updatedAt: '2024-02-01T00:00:00Z',
          },
        ],
        mode,
        now: '2024-03-01T00:00:00Z',
      });

      expect(
        result.rowsToPut.find((row) => row.localId === 'omitted')?.deleted,
      ).toBe(omittedDeleted ? true : undefined);
      expect(result.counts.tombstoned).toBe(tombstoned);
      expect(result.counts.preserved).toBe(preserved);
    },
  );

  it('always preserves explicit server tombstones', () => {
    const result = planReconciliation({
      existing,
      incoming: [
        {
          localId: 'kept',
          deleted: true,
          updatedAt: '2024-02-01T00:00:00Z',
        },
      ],
      mode: 'delta',
      now: '2024-03-01T00:00:00Z',
    });

    expect(result.rowsToPut[0]?.deleted).toBe(true);
    expect(result.counts.explicitTombstones).toBe(1);
  });
});
