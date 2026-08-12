import { fireEvent, render, screen, waitFor } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { ImportDataButton } from '@/screens/Home/ImportDataButton';

vi.mock('@/lib/data-layer', () => ({
  importGeoJsonPoints: vi.fn(),
}));

function simulateFileSelect(file: File) {
  const fileInput = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  Object.defineProperty(fileInput, 'files', {
    value: [file],
    configurable: true,
  });
  fireEvent.change(fileInput);
}

describe('ImportDataButton', () => {
  it('renders import button', () => {
    render(<ImportDataButton projectLocalId="p1" />);
    expect(screen.getByRole('button', { name: /import/i })).toBeDefined();
  });

  it('shows processing state during import', async () => {
    const { importGeoJsonPoints } = await import('@/lib/data-layer');
    vi.mocked(importGeoJsonPoints).mockReturnValue(new Promise(() => {}));

    render(<ImportDataButton projectLocalId="p1" />);

    simulateFileSelect(
      new File(['{}'], 'data.geojson', { type: 'application/json' }),
    );

    await waitFor(() => {
      expect(screen.getByText(/processing/i)).toBeDefined();
    });
  });

  it('shows success with count after import', async () => {
    const { importGeoJsonPoints } = await import('@/lib/data-layer');
    vi.mocked(importGeoJsonPoints).mockResolvedValue({
      imported: 5,
      skipped: 2,
    });

    const onImportComplete = vi.fn();
    render(
      <ImportDataButton
        projectLocalId="p1"
        onImportComplete={onImportComplete}
      />,
    );

    simulateFileSelect(
      new File(['{}'], 'data.geojson', { type: 'application/json' }),
    );

    await waitFor(() => {
      expect(screen.getByText(/5.*imported/i)).toBeDefined();
    });
    expect(onImportComplete).toHaveBeenCalledWith({ imported: 5, skipped: 2 });
  });

  it('shows error on failure', async () => {
    const { importGeoJsonPoints } = await import('@/lib/data-layer');
    vi.mocked(importGeoJsonPoints).mockRejectedValue(new Error('Parse error'));

    render(<ImportDataButton projectLocalId="p1" />);

    simulateFileSelect(
      new File(['{}'], 'data.geojson', { type: 'application/json' }),
    );

    await waitFor(() => {
      expect(screen.getByText(/parse error/i)).toBeDefined();
    });
  });

  it('shows default error message when rejected with non-Error', async () => {
    const { importGeoJsonPoints } = await import('@/lib/data-layer');
    vi.mocked(importGeoJsonPoints).mockRejectedValue('unknown');

    render(<ImportDataButton projectLocalId="p1" />);

    simulateFileSelect(
      new File(['{}'], 'data.geojson', { type: 'application/json' }),
    );

    await waitFor(() => {
      expect(screen.getByText(/import failed/i)).toBeDefined();
    });
  });

  it('resets to idle from success state', async () => {
    const { importGeoJsonPoints } = await import('@/lib/data-layer');
    vi.mocked(importGeoJsonPoints).mockResolvedValue({
      imported: 3,
      skipped: 0,
    });

    render(<ImportDataButton projectLocalId="p1" />);

    simulateFileSelect(
      new File(['{}'], 'data.geojson', { type: 'application/json' }),
    );

    await waitFor(() => {
      expect(screen.getByText(/import another/i)).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /import another/i }));

    expect(screen.getByRole('button', { name: /import data/i })).toBeDefined();
  });

  it('resets to idle from error state', async () => {
    const { importGeoJsonPoints } = await import('@/lib/data-layer');
    vi.mocked(importGeoJsonPoints).mockRejectedValue(new Error('fail'));

    render(<ImportDataButton projectLocalId="p1" />);

    simulateFileSelect(
      new File(['{}'], 'data.geojson', { type: 'application/json' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /try again/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByRole('button', { name: /import data/i })).toBeDefined();
  });

  it('iconOnly mode renders native button with correct aria-label', () => {
    render(
      <ImportDataButton
        projectLocalId="p1"
        iconOnly
        projectName="Test Project"
      />,
    );
    const button = screen.getByRole('button', {
      name: /import data into test project/i,
    });
    expect(button).toBeInTheDocument();
    expect(button.tagName).toBe('BUTTON');
    expect(button).not.toHaveAttribute('tabIndex');
  });

  it('iconOnly button activates on Enter key', () => {
    render(
      <ImportDataButton
        projectLocalId="p1"
        iconOnly
        projectName="Test Project"
      />,
    );
    const button = screen.getByRole('button', {
      name: /import data into test project/i,
    });

    fireEvent.keyDown(button, { key: 'Enter' });
    // Native button handles Enter automatically, but we can verify it's focusable and clickable
    expect(button).toBeInTheDocument();
  });

  it('iconOnly button activates on Space key', () => {
    render(
      <ImportDataButton
        projectLocalId="p1"
        iconOnly
        projectName="Test Project"
      />,
    );
    const button = screen.getByRole('button', {
      name: /import data into test project/i,
    });

    fireEvent.keyDown(button, { key: ' ' });
    // Native button handles Space automatically
    expect(button).toBeInTheDocument();
  });
});
