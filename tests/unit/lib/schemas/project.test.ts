import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { projectsResponseSchema } from '@/lib/schemas/project';

describe('projectsResponseSchema', () => {
  const validData = {
    data: [
      { projectId: 'proj-1', name: 'Project Alpha' },
      { projectId: 'proj-2' },
    ],
  };

  it('parses valid projects response', () => {
    const result = v.parse(projectsResponseSchema, validData);
    expect(result).toEqual(validData);
  });

  it('parses projects with name present', () => {
    const result = v.parse(projectsResponseSchema, {
      data: [{ projectId: 'proj-1', name: 'Project Alpha' }],
    });
    expect(result.data[0]?.name).toBe('Project Alpha');
  });

  it('parses projects without name (optional)', () => {
    const result = v.parse(projectsResponseSchema, {
      data: [{ projectId: 'proj-1' }],
    });
    expect(result.data[0]?.projectId).toBe('proj-1');
    expect(result.data[0]?.name).toBeUndefined();
  });

  it('parses empty data array', () => {
    const result = v.parse(projectsResponseSchema, { data: [] });
    expect(result.data).toEqual([]);
  });

  it('rejects missing data wrapper', () => {
    expect(() =>
      v.parse(projectsResponseSchema, [{ projectId: 'proj-1' }]),
    ).toThrow();
  });

  it('rejects missing projectId', () => {
    expect(() =>
      v.parse(projectsResponseSchema, {
        data: [{ name: 'No ID' }],
      }),
    ).toThrow();
  });

  it('rejects non-string projectId', () => {
    expect(() =>
      v.parse(projectsResponseSchema, {
        data: [{ projectId: 123 }],
      }),
    ).toThrow();
  });

  it('rejects non-string name when present', () => {
    expect(() =>
      v.parse(projectsResponseSchema, {
        data: [{ projectId: 'proj-1', name: 42 }],
      }),
    ).toThrow();
  });

  it('rejects non-array data', () => {
    expect(() =>
      v.parse(projectsResponseSchema, {
        data: { projectId: 'proj-1' },
      }),
    ).toThrow();
  });

  it('rejects empty object', () => {
    expect(() => v.parse(projectsResponseSchema, {})).toThrow();
  });
});
