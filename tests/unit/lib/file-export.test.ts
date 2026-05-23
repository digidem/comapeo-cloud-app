import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadText, triggerDownload } from '@/lib/file-export';

describe('triggerDownload', () => {
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
        'blob:http://localhost/test123',
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

  it('creates an object URL from the blob', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    triggerDownload(blob, 'test.txt');

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
  });

  it('sets anchor href, download attribute, and clicks', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    triggerDownload(blob, 'test.txt');

    expect(anchorElement.href).toBe('blob:http://localhost/test123');
    expect(anchorElement.download).toBe('test.txt');
    expect(anchorClickMock).toHaveBeenCalledOnce();
  });

  it('appends anchor to body and removes it after click', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    triggerDownload(blob, 'test.txt');

    expect(document.body.appendChild).toHaveBeenCalledWith(anchorElement);
    expect(document.body.removeChild).toHaveBeenCalledWith(anchorElement);
  });

  it('revokes the object URL after click', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    triggerDownload(blob, 'test.txt');

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(
      'blob:http://localhost/test123',
    );
  });
});

describe('downloadText', () => {
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
        'blob:http://localhost/text456',
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

  it('creates a Blob with the correct text content and MIME type', () => {
    downloadText('hello world', 'test.csv', 'text/csv');

    const createMock = URL.createObjectURL as ReturnType<typeof vi.fn>;
    expect(createMock).toHaveBeenCalledOnce();
    const [blob] = createMock.mock.calls[0] as [Blob];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/csv');
  });

  it('serializes text content into the blob', async () => {
    downloadText('hello world', 'test.csv', 'text/csv');

    const createMock = URL.createObjectURL as ReturnType<typeof vi.fn>;
    const [blob] = createMock.mock.calls[0] as [Blob];
    expect(await blob.text()).toBe('hello world');
  });

  it('sets the filename correctly', () => {
    downloadText('data', 'export.csv', 'text/csv');

    expect(anchorElement.download).toBe('export.csv');
  });

  it('uses application/geo+json MIME type for geojson', () => {
    downloadText('{}', 'map.geojson', 'application/geo+json');

    const createMock = URL.createObjectURL as ReturnType<typeof vi.fn>;
    const [blob] = createMock.mock.calls[0] as [Blob];
    expect(blob.type).toBe('application/geo+json');
  });
});
