import type { FeatureCollection } from 'geojson';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exportFeatureCollection } from '@/lib/geojson-export';

const mockFeatureCollection: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: { name: 'test' },
    },
  ],
};

describe('exportFeatureCollection', () => {
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;
  let anchorClickMock: ReturnType<typeof vi.fn>;
  let anchorElement: HTMLAnchorElement;

  beforeEach(() => {
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;

    URL.createObjectURL = vi
      .fn()
      .mockReturnValue(
        'blob:http://localhost/abc123',
      ) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;

    anchorClickMock = vi.fn();
    anchorElement = document.createElement('a');
    anchorElement.click = anchorClickMock as unknown as () => void;

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return anchorElement;
      return document.createElement(tag);
    });

    vi.spyOn(document.body, 'appendChild').mockImplementation(
      (node: Node) => node,
    );
    vi.spyOn(document.body, 'removeChild').mockImplementation(
      (node: Node) => node,
    );
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('creates a Blob with the correct JSON content and MIME type', () => {
    exportFeatureCollection(mockFeatureCollection, 'test.geojson');

    const createMock = URL.createObjectURL as ReturnType<typeof vi.fn>;
    expect(createMock).toHaveBeenCalledOnce();
    const firstCall = createMock.mock.calls[0] as [Blob];
    const blob = firstCall[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/geo+json');
  });

  it('sets the anchor href and download attribute, then calls click', () => {
    exportFeatureCollection(mockFeatureCollection, 'test.geojson');

    expect(anchorElement.href).toBe('blob:http://localhost/abc123');
    expect(anchorElement.download).toBe('test.geojson');
    expect(anchorClickMock).toHaveBeenCalledOnce();
  });

  it('revokes the object URL after click', () => {
    exportFeatureCollection(mockFeatureCollection, 'test.geojson');

    const revokeMock = URL.revokeObjectURL as ReturnType<typeof vi.fn>;
    expect(revokeMock).toHaveBeenCalledWith('blob:http://localhost/abc123');
  });

  it('serializes the feature collection with 2-space indentation', async () => {
    exportFeatureCollection(mockFeatureCollection, 'test.geojson');

    const createMock = URL.createObjectURL as ReturnType<typeof vi.fn>;
    const firstCall = createMock.mock.calls[0] as [Blob];
    const blob = firstCall[0];
    const text = await blob.text();
    expect(text).toBe(JSON.stringify(mockFeatureCollection, null, 2));
  });

  it('uses the provided filename for the download attribute', () => {
    exportFeatureCollection(mockFeatureCollection, 'my-coverage.geojson');

    expect(anchorElement.download).toBe('my-coverage.geojson');
  });
});
