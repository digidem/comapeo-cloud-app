import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { AlertCard } from '@/components/shared/AlertCard';
import type { Alert } from '@/lib/db';

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    localId: 'alert-test-1',
    projectLocalId: 'proj-1',
    sourceType: 'remoteArchive',
    sourceId: 'server-1',
    remoteId: 'alert-1',
    geometry: { type: 'Point', coordinates: [102.0, 0.5] },
    createdAt: '2024-03-15T08:00:00Z',
    updatedAt: '2024-03-15T08:00:00Z',
    dirtyLocal: false,
    deleted: false,
    ...overrides,
  };
}

describe('AlertCard', () => {
  it('renders severity badge when metadata.severity is high', () => {
    const alert = makeAlert({
      metadata: { severity: 'high' },
    });
    render(<AlertCard alert={alert} />);
    expect(screen.getByText('High')).toBeInTheDocument();
    // Badge should have data-variant="high"
    const badge = screen.getByText('High').closest('[data-variant]');
    expect(badge).toHaveAttribute('data-variant', 'high');
  });

  it('renders type badge when metadata.type is present', () => {
    const alert = makeAlert({
      metadata: { severity: 'high', type: 'deforestation' },
    });
    render(<AlertCard alert={alert} />);
    expect(screen.getByText('deforestation')).toBeInTheDocument();
  });

  it('renders date range when detectionDateStart and detectionDateEnd are present', () => {
    const alert = makeAlert({
      detectionDateStart: '2024-03-14T00:00:00Z',
      detectionDateEnd: '2024-03-15T00:00:00Z',
    });
    render(<AlertCard alert={alert} />);
    // Should show UTC-formatted dates with an en-dash
    expect(screen.getByText(/03\/14\/2024/)).toBeInTheDocument();
    expect(screen.getByText(/03\/15\/2024/)).toBeInTheDocument();
  });

  it('renders only start date when end date is missing', () => {
    const alert = makeAlert({
      detectionDateStart: '2024-03-14T00:00:00Z',
    });
    render(<AlertCard alert={alert} />);
    expect(screen.getByText(/03\/14\/2024/)).toBeInTheDocument();
    // No en-dash separator
    expect(screen.queryByText(/–/)).not.toBeInTheDocument();
  });

  it('omits date range when both dates are missing', () => {
    const alert = makeAlert({});
    render(<AlertCard alert={alert} />);
    // Should not have "Detected" text
    expect(screen.queryByText(/Detected/)).not.toBeInTheDocument();
  });

  it('renders source ID when remoteSourceId is present', () => {
    const alert = makeAlert({
      remoteSourceId: 'source-1',
    });
    render(<AlertCard alert={alert} />);
    expect(screen.getByText(/source-1/)).toBeInTheDocument();
  });

  it('omits source ID block when remoteSourceId is absent', () => {
    const alert = makeAlert({});
    render(<AlertCard alert={alert} />);
    expect(screen.queryByTestId('alert-source-id')).not.toBeInTheDocument();
  });

  it('falls back to "Alert" label when metadata.type is absent', () => {
    const alert = makeAlert({
      metadata: { severity: 'medium' },
    });
    render(<AlertCard alert={alert} />);
    expect(screen.getByText('Alert')).toBeInTheDocument();
  });

  it('applies info severity variant when severity is unrecognized', () => {
    const alert = makeAlert({
      metadata: { severity: 'critical' },
    });
    render(<AlertCard alert={alert} />);
    // Should render "Unknown" for unrecognized severity
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    const badge = screen.getByText('Unknown').closest('[data-variant]');
    expect(badge).toHaveAttribute('data-variant', 'info');
  });

  it('renders coordinates when geometry is a Point', () => {
    const alert = makeAlert({
      geometry: { type: 'Point', coordinates: [-74.006, 40.7128] },
    });
    render(<AlertCard alert={alert} />);
    // Should show lat/lon rounded to 4 decimal places
    expect(screen.getByText(/40\.7128/)).toBeInTheDocument();
    expect(screen.getByText(/-74\.006/)).toBeInTheDocument();
  });

  it('shows "No location" when geometry is absent', () => {
    const alert = makeAlert({ geometry: undefined });
    render(<AlertCard alert={alert} />);
    expect(screen.getByText('No location')).toBeInTheDocument();
  });

  it('shows "No location" when geometry is not a Point', () => {
    const alert = makeAlert({
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
    });
    render(<AlertCard alert={alert} />);
    expect(screen.getByText('No location')).toBeInTheDocument();
  });
});
