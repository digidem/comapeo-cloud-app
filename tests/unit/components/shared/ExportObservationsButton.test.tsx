import userEvent from '@testing-library/user-event';
import { render, screen } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  Children,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  cloneElement,
  isValidElement,
  useState,
} from 'react';

import { ExportObservationsButton } from '@/components/shared/ExportObservationsButton';
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

// Mock Radix DropdownMenu with React state for open/close
vi.mock('@radix-ui/react-dropdown-menu', () => {
  function MockRoot({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <div data-testid="dropdown-root" data-open={isOpen}>
        {Children.map(children, (child: ReactNode) => {
          if (isValidElement(child)) {
            return cloneElement(
              child as React.ReactElement<Record<string, unknown>>,
              {
                _isOpen: isOpen,
                _setIsOpen: setIsOpen,
              },
            );
          }
          return child;
        })}
      </div>
    );
  }

  function MockTrigger({
    children,
    _setIsOpen,
    ...props
  }: {
    children: ReactNode;
    asChild?: boolean;
    disabled?: boolean;
    _isOpen?: boolean;
    _setIsOpen?: Dispatch<SetStateAction<boolean>>;
  }) {
    return (
      <button
        data-testid="dropdown-trigger"
        disabled={props.disabled}
        onClick={() => _setIsOpen?.((prev: boolean) => !prev)}
      >
        {children}
      </button>
    );
  }

  function MockContent({
    children,
    _isOpen,
  }: {
    children: ReactNode;
    _isOpen?: boolean;
    _setIsOpen?: Dispatch<SetStateAction<boolean>>;
  }) {
    return _isOpen ? (
      <div data-testid="dropdown-content">{children}</div>
    ) : null;
  }

  function MockItem({
    children,
    onSelect,
    _setIsOpen,
  }: {
    children: ReactNode;
    onSelect?: () => void;
    _isOpen?: boolean;
    _setIsOpen?: Dispatch<SetStateAction<boolean>>;
  }) {
    return (
      <button
        data-testid="dropdown-item"
        onClick={() => {
          onSelect?.();
          _setIsOpen?.(false);
        }}
      >
        {children}
      </button>
    );
  }

  function MockPortal({
    children,
    _isOpen,
    _setIsOpen,
  }: {
    children: ReactNode;
    _isOpen?: boolean;
    _setIsOpen?: Dispatch<SetStateAction<boolean>>;
  }) {
    return (
      <>
        {Children.map(children, (child: ReactNode) => {
          if (isValidElement(child)) {
            return cloneElement(
              child as React.ReactElement<Record<string, unknown>>,
              {
                _isOpen,
                _setIsOpen,
              },
            );
          }
          return child;
        })}
      </>
    );
  }

  return {
    Root: MockRoot,
    Trigger: MockTrigger,
    Content: MockContent,
    Item: MockItem,
    Portal: MockPortal,
  };
});

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

describe('ExportObservationsButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockObservationsToGeoJson.mockReturnValue({
      type: 'FeatureCollection',
      features: [],
    });
    mockObservationsToCsv.mockReturnValue('docId,category');
    mockBuildExportFilename.mockImplementation(
      (name: string, format: string) =>
        `test-observations-2024-06-15.${format}`,
    );
  });

  it('renders an Export button', () => {
    render(
      <ExportObservationsButton
        observations={[makeObservation()]}
        projectName="Test Project"
      />,
    );

    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  it('is not disabled when observations exist', () => {
    render(
      <ExportObservationsButton
        observations={[makeObservation()]}
        projectName="Test Project"
      />,
    );

    const trigger = screen.getByTestId('dropdown-trigger');
    expect(trigger).not.toBeDisabled();
  });

  it('is disabled when disabled prop is true', () => {
    render(
      <ExportObservationsButton
        observations={[]}
        projectName="Test Project"
        disabled={true}
      />,
    );

    const trigger = screen.getByTestId('dropdown-trigger');
    expect(trigger).toBeDisabled();
  });

  it('shows dropdown items when trigger is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ExportObservationsButton
        observations={[makeObservation()]}
        projectName="Test Project"
      />,
    );

    await user.click(screen.getByTestId('dropdown-trigger'));

    expect(screen.getByText('GeoJSON')).toBeInTheDocument();
    expect(screen.getByText('CSV')).toBeInTheDocument();
  });

  it('calls downloadText with GeoJSON format when GeoJSON item is clicked', async () => {
    const user = userEvent.setup();
    const geojsonStr = JSON.stringify(
      { type: 'FeatureCollection', features: [] },
      null,
      2,
    );
    mockObservationsToGeoJson.mockReturnValue({
      type: 'FeatureCollection',
      features: [],
    });

    render(
      <ExportObservationsButton
        observations={[makeObservation()]}
        projectName="Test Project"
      />,
    );

    // Open dropdown
    await user.click(screen.getByTestId('dropdown-trigger'));

    // Click GeoJSON item
    const items = screen.getAllByTestId('dropdown-item');
    await user.click(items[0]!);

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
  });

  it('calls downloadText with CSV format when CSV item is clicked', async () => {
    const user = userEvent.setup();
    mockObservationsToCsv.mockReturnValue('docId,category\nobs-1,forest');

    render(
      <ExportObservationsButton
        observations={[makeObservation()]}
        projectName="Test Project"
      />,
    );

    // Open dropdown
    await user.click(screen.getByTestId('dropdown-trigger'));

    // Click CSV item (second item)
    const items = screen.getAllByTestId('dropdown-item');
    await user.click(items[1]!);

    expect(mockObservationsToCsv).toHaveBeenCalled();
    expect(mockBuildExportFilename).toHaveBeenCalledWith('Test Project', 'csv');
    expect(mockDownloadText).toHaveBeenCalledWith(
      'docId,category\nobs-1,forest',
      'test-observations-2024-06-15.csv',
      'text/csv',
    );
  });

  it('catches errors in GeoJSON export, logs to console, and alerts the user', async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    mockObservationsToGeoJson.mockImplementation(() => {
      throw new Error('GeoJSON conversion failed');
    });

    render(
      <ExportObservationsButton
        observations={[makeObservation()]}
        projectName="Test Project"
      />,
    );

    // Open dropdown
    await user.click(screen.getByTestId('dropdown-trigger'));

    // Click GeoJSON item — should not throw
    const items = screen.getAllByTestId('dropdown-item');
    await user.click(items[0]!);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Export failed:',
      expect.any(Error),
    );
    expect(alertSpy).toHaveBeenCalledWith('Export failed. Please try again.');
    expect(mockDownloadText).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it('catches errors in CSV export, logs to console, and alerts the user', async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    mockObservationsToCsv.mockImplementation(() => {
      throw new Error('CSV conversion failed');
    });

    render(
      <ExportObservationsButton
        observations={[makeObservation()]}
        projectName="Test Project"
      />,
    );

    // Open dropdown
    await user.click(screen.getByTestId('dropdown-trigger'));

    // Click CSV item — should not throw
    const items = screen.getAllByTestId('dropdown-item');
    await user.click(items[1]!);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Export failed:',
      expect.any(Error),
    );
    expect(alertSpy).toHaveBeenCalledWith('Export failed. Please try again.');
    expect(mockDownloadText).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
    alertSpy.mockRestore();
  });
});
