import { render, screen, userEvent, waitFor } from '@tests/mocks/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project, ReportBrandingLogoAsset } from '@/lib/db';
import { REPORT_BRANDING_LOGO_MAX_BYTES } from '@/lib/reports/report-branding';
import { ReportBrandingDialog } from '@/screens/Home/ReportBrandingDialog';

vi.mock('@/lib/data-layer', () => ({
  updateProject: vi.fn(),
}));

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    localId: 'project-1',
    sourceType: 'local',
    sourceId: 'local',
    name: 'Forest Guardians',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    dirtyLocal: true,
    deleted: false,
    ...overrides,
  };
}

function makeLogo(): ReportBrandingLogoAsset {
  return {
    versionId: 'logo-v1',
    data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      .buffer,
    contentType: 'image/png',
    width: 512,
    height: 256,
    byteLength: 8,
    sha256: 'a'.repeat(64),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ReportBrandingDialog', () => {
  it('defaults the organization name to the project name', () => {
    render(
      <ReportBrandingDialog
        isOpen
        project={makeProject()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /organization name/i }),
    ).toHaveValue('Forest Guardians');
    expect(screen.getByText(/no report logo configured/i)).toBeInTheDocument();
  });

  it('saves an independently editable organization name with a new revision', async () => {
    const { updateProject } = await import('@/lib/data-layer');
    vi.mocked(updateProject).mockResolvedValue(makeProject());
    const onSaved = vi.fn();
    const user = userEvent.setup();

    render(
      <ReportBrandingDialog
        isOpen
        project={makeProject()}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );

    const nameInput = screen.getByRole('textbox', {
      name: /organization name/i,
    });
    await user.clear(nameInput);
    await user.type(nameInput, '  Associação Guardiões  ');
    await user.click(screen.getByRole('button', { name: /save branding/i }));

    await waitFor(() => {
      expect(updateProject).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({
          reportBranding: expect.objectContaining({
            schemaVersion: 1,
            organizationName: 'Associação Guardiões',
            revision: 1,
            logo: undefined,
          }),
        }),
      );
      expect(onSaved).toHaveBeenCalledOnce();
    });
  });

  it('renders a preview for an existing report logo', () => {
    render(
      <ReportBrandingDialog
        isOpen
        project={makeProject({
          reportBranding: {
            schemaVersion: 1,
            organizationName: 'Forest Guardians Association',
            revision: 3,
            updatedAt: '2026-09-03T10:00:00.000Z',
            logo: makeLogo(),
          },
        })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('img', { name: /organization logo/i }),
    ).toHaveAttribute('src', 'data:image/png;base64,iVBORw0KGgo=');
  });

  it('removes an existing report logo without changing the project icon', async () => {
    const { updateProject } = await import('@/lib/data-layer');
    vi.mocked(updateProject).mockResolvedValue(makeProject());
    const user = userEvent.setup();
    const logo = makeLogo();

    render(
      <ReportBrandingDialog
        isOpen
        project={makeProject({
          iconRef: { docId: 'project-icon', contentType: 'image/png' },
          reportBranding: {
            schemaVersion: 1,
            organizationName: 'Forest Guardians Association',
            revision: 3,
            updatedAt: '2026-09-03T10:00:00.000Z',
            logo,
          },
        })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /remove logo/i }));
    await user.click(screen.getByRole('button', { name: /save branding/i }));

    await waitFor(() => {
      expect(updateProject).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({
          reportBranding: expect.objectContaining({
            organizationName: 'Forest Guardians Association',
            revision: 4,
            logo: undefined,
          }),
        }),
      );
    });
  });

  it('rejects a blank organization name without writing project state', async () => {
    const { updateProject } = await import('@/lib/data-layer');
    const user = userEvent.setup();

    render(
      <ReportBrandingDialog
        isOpen
        project={makeProject()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const nameInput = screen.getByRole('textbox', {
      name: /organization name/i,
    });
    await user.clear(nameInput);
    await user.click(screen.getByRole('button', { name: /save branding/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Organization name is required',
    );
    expect(updateProject).not.toHaveBeenCalled();
  });

  it('accepts a valid PNG logo and persists its exact validated asset metadata', async () => {
    const { updateProject } = await import('@/lib/data-layer');
    vi.mocked(updateProject).mockResolvedValue(makeProject());
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 512, height: 256, close }),
    );
    const user = userEvent.setup();
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const file = new File([bytes], 'logo.png', { type: 'image/png' });

    render(
      <ReportBrandingDialog
        isOpen
        project={makeProject()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.upload(screen.getByLabelText(/upload logo/i), file);
    expect(
      await screen.findByText(/report logo configured/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /organization logo/i }),
    ).toHaveAttribute('src', 'data:image/png;base64,iVBORw0KGgo=');
    await user.click(screen.getByRole('button', { name: /save branding/i }));

    await waitFor(() => {
      expect(updateProject).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({
          reportBranding: expect.objectContaining({
            logo: expect.objectContaining({
              contentType: 'image/png',
              width: 512,
              height: 256,
              byteLength: 8,
              sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            }),
          }),
        }),
      );
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects image MIME spoofing before project state is written', async () => {
    const { updateProject } = await import('@/lib/data-layer');
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 100, height: 100, close: vi.fn() }),
    );
    const user = userEvent.setup();
    const file = new File(['<svg></svg>'], 'fake.png', { type: 'image/png' });

    render(
      <ReportBrandingDialog
        isOpen
        project={makeProject()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.upload(screen.getByLabelText(/upload logo/i), file);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Logo must be PNG, JPEG, or WebP',
    );
    expect(updateProject).not.toHaveBeenCalled();
  });

  it('prevents saving while a selected logo is still being decoded', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockReturnValue(new Promise(() => {})),
    );
    const user = userEvent.setup();
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const file = new File([bytes], 'logo.png', { type: 'image/png' });

    render(
      <ReportBrandingDialog
        isOpen
        project={makeProject()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.upload(screen.getByLabelText(/upload logo/i), file);

    expect(
      screen.getByRole('button', { name: /save branding/i }),
    ).toBeDisabled();
  });

  it('rejects files larger than 2 MB before attempting image decode', async () => {
    const createImageBitmap = vi.fn();
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    const user = userEvent.setup();
    const bytes = new Uint8Array(REPORT_BRANDING_LOGO_MAX_BYTES + 1);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const file = new File([bytes], 'too-large.png', { type: 'image/png' });

    render(
      <ReportBrandingDialog
        isOpen
        project={makeProject()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.upload(screen.getByLabelText(/upload logo/i), file);

    expect(await screen.findByRole('alert')).toHaveTextContent('2 MB');
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('rejects decoded logo dimensions larger than 2048 pixels', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 4096, height: 100, close: vi.fn() }),
    );
    const user = userEvent.setup();
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const file = new File([bytes], 'wide.png', { type: 'image/png' });

    render(
      <ReportBrandingDialog
        isOpen
        project={makeProject()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.upload(screen.getByLabelText(/upload logo/i), file);

    expect(await screen.findByRole('alert')).toHaveTextContent('2048');
  });

  it('rejects unsupported image MIME types before attempting decode', async () => {
    const createImageBitmap = vi.fn();
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    const user = userEvent.setup({ applyAccept: false });
    const file = new File(['gif'], 'logo.gif', { type: 'image/gif' });

    render(
      <ReportBrandingDialog
        isOpen
        project={makeProject()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.upload(screen.getByLabelText(/upload logo/i), file);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Logo must be PNG, JPEG, or WebP',
    );
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('rejects a declared MIME type that does not match the image bytes', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 32, height: 32, close: vi.fn() }),
    );
    const user = userEvent.setup();
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const file = new File([bytes], 'logo.jpg', { type: 'image/jpeg' });

    render(
      <ReportBrandingDialog
        isOpen
        project={makeProject()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.upload(screen.getByLabelText(/upload logo/i), file);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'does not match the image content',
    );
  });

  it('rejects invalid decoded dimensions', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 0, height: 100, close: vi.fn() }),
    );
    const user = userEvent.setup();
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const file = new File([bytes], 'zero-width.png', { type: 'image/png' });

    render(
      <ReportBrandingDialog
        isOpen
        project={makeProject()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.upload(screen.getByLabelText(/upload logo/i), file);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'valid whole pixels',
    );
  });

  it('decodes with a data URL fallback when createImageBitmap is unavailable', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    const readAsDataURL = vi.fn(function (this: FileReader) {
      Object.defineProperty(this, 'result', {
        configurable: true,
        value: 'data:image/png;base64,iVBORw0KGgo=',
      });
      queueMicrotask(() =>
        this.onload?.(new ProgressEvent('load') as ProgressEvent<FileReader>),
      );
    });
    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      error: DOMException | null = null;
      onload: FileReader['onload'] = null;
      onerror: FileReader['onerror'] = null;
      readAsDataURL = readAsDataURL;
    }
    class MockImage {
      naturalWidth = 320;
      naturalHeight = 160;
      onload: ((this: GlobalEventHandlers, ev: Event) => unknown) | null = null;
      onerror: OnErrorEventHandler = null;
      set src(_value: string) {
        queueMicrotask(() =>
          this.onload?.call(this as never, new Event('load')),
        );
      }
    }
    vi.stubGlobal('FileReader', MockFileReader);
    vi.stubGlobal('Image', MockImage);
    const user = userEvent.setup();
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const file = new File([bytes], 'fallback.png', { type: 'image/png' });

    render(
      <ReportBrandingDialog
        isOpen
        project={makeProject()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.upload(screen.getByLabelText(/upload logo/i), file);

    expect(
      await screen.findByText(/report logo configured/i),
    ).toBeInTheDocument();
    expect(readAsDataURL).toHaveBeenCalledOnce();
  });

  it('shows a processing error when browser image decoding fails', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockRejectedValue(new Error('decode failed')),
    );
    const user = userEvent.setup();
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const file = new File([bytes], 'broken.png', { type: 'image/png' });

    render(
      <ReportBrandingDialog
        isOpen
        project={makeProject()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.upload(screen.getByLabelText(/upload logo/i), file);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to process logo image',
    );
  });

  it('shows a save error when persistence rejects', async () => {
    const { updateProject } = await import('@/lib/data-layer');
    vi.mocked(updateProject).mockRejectedValue(new Error('write failed'));
    const onSaved = vi.fn();
    const user = userEvent.setup();

    render(
      <ReportBrandingDialog
        isOpen
        project={makeProject()}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );

    await user.click(screen.getByRole('button', { name: /save branding/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to save report branding',
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows a save error when the project disappears during persistence', async () => {
    const { updateProject } = await import('@/lib/data-layer');
    vi.mocked(updateProject).mockResolvedValue(undefined);
    const onSaved = vi.fn();
    const user = userEvent.setup();

    render(
      <ReportBrandingDialog
        isOpen
        project={makeProject()}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );

    await user.click(screen.getByRole('button', { name: /save branding/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to save report branding',
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('closes without saving when Cancel is selected', async () => {
    const { updateProject } = await import('@/lib/data-layer');
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <ReportBrandingDialog
        isOpen
        project={makeProject()}
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(updateProject).not.toHaveBeenCalled();
  });
});
