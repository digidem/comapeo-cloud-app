import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { ExportSheet } from '@/components/shared/ExportSheet';

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  onExportGeoJson: vi.fn(),
  onExportCsv: vi.fn(),
};

describe('ExportSheet', () => {
  it('renders the sheet title when open', () => {
    render(<ExportSheet {...defaultProps} />);
    expect(
      screen.getByRole('dialog', { name: 'Export Observations' }),
    ).toBeInTheDocument();
  });

  it('renders the GeoJSON option with description and extension', () => {
    render(<ExportSheet {...defaultProps} />);
    expect(screen.getByText('GeoJSON')).toBeInTheDocument();
    expect(
      screen.getByText('Geographic data for mapping tools'),
    ).toBeInTheDocument();
    expect(screen.getByText('.geojson')).toBeInTheDocument();
  });

  it('renders the CSV option with description and extension', () => {
    render(<ExportSheet {...defaultProps} />);
    expect(screen.getByText('CSV')).toBeInTheDocument();
    expect(
      screen.getByText('Spreadsheet-compatible rows and columns'),
    ).toBeInTheDocument();
    expect(screen.getByText('.csv')).toBeInTheDocument();
  });

  it('does not render content when open=false', () => {
    render(<ExportSheet {...defaultProps} open={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('GeoJSON')).not.toBeInTheDocument();
  });

  it('has a close button', () => {
    render(<ExportSheet {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('calls onExportGeoJson and closes when GeoJSON clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onExportGeoJson = vi.fn();
    render(
      <ExportSheet
        {...defaultProps}
        onOpenChange={onOpenChange}
        onExportGeoJson={onExportGeoJson}
      />,
    );

    await user.click(screen.getByText('GeoJSON'));
    expect(onExportGeoJson).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onExportCsv and closes when CSV clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onExportCsv = vi.fn();
    render(
      <ExportSheet
        {...defaultProps}
        onOpenChange={onOpenChange}
        onExportCsv={onExportCsv}
      />,
    );

    await user.click(screen.getByText('CSV'));
    expect(onExportCsv).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onOpenChange when the close (X) button is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ExportSheet {...defaultProps} onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onOpenChange when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ExportSheet {...defaultProps} onOpenChange={onOpenChange} />);

    // Radix Dialog renders the overlay as the sibling before the content
    const dialog = screen.getByRole('dialog');
    const overlay = dialog.previousElementSibling;
    expect(overlay).toBeTruthy();

    await user.click(overlay!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
