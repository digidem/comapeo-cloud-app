import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactElement } from 'react';

import { ExportObservationsButton } from '@/components/shared/ExportObservationsButton';
import { ToastProvider } from '@/components/ui/toast';
import type { Observation } from '@/lib/data-layer';

// --- Mocks ---

const mockDownloadText = vi.fn();
vi.mock('@/lib/file-export', () => ({
  downloadText: (...args: unknown[]) => mockDownloadText(...args),
}));

const mockObservationsToGeoJson = vi.fn();
const mockObservationsToCsv = vi.fn();
const mockBuildExportFilename = vi.fn();
vi.mock('@/lib/observation-export', () => ({
  observationsToGeoJson: (...args: unknown[]) =>
    mockObservationsToGeoJson(...args),
  observationsToCsv: (...args: unknown[]) => mockObservationsToCsv(...args),
  buildExportFilename: (...args: unknown[]) => mockBuildExportFilename(...args),
}));

// --- Helpers ---

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    localId: 'obs-1',
    projectLocalId: 'proj-1',
    sourceType: 'local',
    sourceId: 'local-1',
    createdAt: '2024-03-15T10:30:00Z',
    updatedAt: '2024-03-15T10:30:00Z',
    dirtyLocal: false,
    deleted: false,
    ...overrides,
  };
}

// useToast requires a ToastProvider; wrap the component locally rather than
// modifying the shared test-utils wrapper.
function renderButton(ui: ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

describe('ExportObservationsButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockObservationsToGeoJson.mockReturnValue({
      type: 'FeatureCollection',
      features: [],
    });
    mockObservationsToCsv.mockReturnValue('docId,category');
    mockBuildExportFilename.mockImplementation(
      (_name: string, format: string) =>
        `test-observations-2024-06-15.${format}`,
    );
  });

  it('renders an Export button', () => {
    renderButton(
      <ExportObservationsButton
        observations={[makeObservation()]}
        projectName="Test Project"
      />,
    );

    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('is not disabled when observations exist', () => {
    renderButton(
      <ExportObservationsButton
        observations={[makeObservation()]}
        projectName="Test Project"
      />,
    );

    expect(screen.getByRole('button', { name: 'Export' })).not.toBeDisabled();
  });

  it('is disabled when disabled prop is true', () => {
    renderButton(
      <ExportObservationsButton
        observations={[]}
        projectName="Test Project"
        disabled={true}
      />,
    );

    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
  });

  it('opens the export sheet when the Export button is clicked', async () => {
    const user = userEvent.setup();
    renderButton(
      <ExportObservationsButton
        observations={[makeObservation()]}
        projectName="Test Project"
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Export' }));

    expect(
      screen.getByRole('dialog', { name: 'Export Observations' }),
    ).toBeInTheDocument();
    expect(screen.getByText('GeoJSON')).toBeInTheDocument();
    expect(screen.getByText('CSV')).toBeInTheDocument();
  });

  it('exports GeoJSON and closes the sheet when GeoJSON is selected', async () => {
    const user = userEvent.setup();
    const geojsonStr = JSON.stringify(
      { type: 'FeatureCollection', features: [] },
      null,
      2,
    );

    renderButton(
      <ExportObservationsButton
        observations={[makeObservation()]}
        projectName="Test Project"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(screen.getByText('GeoJSON'));

    expect(mockObservationsToGeoJson).toHaveBeenCalled();
    expect(mockBuildExportFilename).toHaveBeenCalledWith(
      'Test Project',
      'geojson',
    );
    expect(mockDownloadText).toHaveBeenCalledWith(
      geojsonStr,
      'test-observations-2024-06-15.geojson',
      'application/geo+json',
    );
    // sheet closes
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('exports CSV and closes the sheet when CSV is selected', async () => {
    const user = userEvent.setup();
    mockObservationsToCsv.mockReturnValue('docId,category\nobs-1,forest');

    renderButton(
      <ExportObservationsButton
        observations={[makeObservation()]}
        projectName="Test Project"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(screen.getByText('CSV'));

    expect(mockObservationsToCsv).toHaveBeenCalled();
    expect(mockBuildExportFilename).toHaveBeenCalledWith('Test Project', 'csv');
    expect(mockDownloadText).toHaveBeenCalledWith(
      'docId,category\nobs-1,forest',
      'test-observations-2024-06-15.csv',
      'text/csv',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows an error toast and logs when GeoJSON export fails', async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockObservationsToGeoJson.mockImplementation(() => {
      throw new Error('GeoJSON conversion failed');
    });

    renderButton(
      <ExportObservationsButton
        observations={[makeObservation()]}
        projectName="Test Project"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(screen.getByText('GeoJSON'));

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Export failed:',
      expect.any(Error),
    );
    expect(
      await screen.findByText('Export failed. Please try again.'),
    ).toBeInTheDocument();
    expect(mockDownloadText).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('shows an error toast and logs when CSV export fails', async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockObservationsToCsv.mockImplementation(() => {
      throw new Error('CSV conversion failed');
    });

    renderButton(
      <ExportObservationsButton
        observations={[makeObservation()]}
        projectName="Test Project"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(screen.getByText('CSV'));

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Export failed:',
      expect.any(Error),
    );
    expect(
      await screen.findByText('Export failed. Please try again.'),
    ).toBeInTheDocument();
    expect(mockDownloadText).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
