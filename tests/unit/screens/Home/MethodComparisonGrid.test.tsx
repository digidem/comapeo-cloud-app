import { fireEvent, render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { CoverageMethodResult } from '@/hooks/useProjectCoverage';
import type { CalculationResult } from '@/lib/area-calculator/types';
import { MethodComparisonGrid } from '@/screens/Home/MethodComparisonGrid';

function makeResult(methodId: string, areaM2: number): CoverageMethodResult {
  return {
    methodId,
    result: {
      id: methodId,
      label: methodId,
      description: 'test',
      featureCollection: { type: 'FeatureCollection', features: [] },
      previewFeatureCollection: { type: 'FeatureCollection', features: [] },
      areaM2,
      metadata: {},
    } satisfies CalculationResult,
  };
}

const allResults: CoverageMethodResult[] = [
  makeResult('observed', 10000),
  makeResult('connectivity10', 20000),
  makeResult('connectivity30', 30000),
  makeResult('clusterHull', 40000),
  makeResult('grid', 50000),
];

const defaultProps = {
  results: allResults,
  activeMethodId: 'observed',
  isCalculating: false,
  unit: 'ha' as const,
  onActivate: vi.fn(),
  onExport: vi.fn(),
};

describe('MethodComparisonGrid', () => {
  it('renders 5 method cards', () => {
    render(<MethodComparisonGrid {...defaultProps} />);
    // Each method has a distinct label
    expect(screen.getByText('Observed Footprint')).toBeInTheDocument();
    expect(screen.getByText('10km Connectivity')).toBeInTheDocument();
    expect(screen.getByText('30km Connectivity')).toBeInTheDocument();
    expect(screen.getByText('Cluster Hull')).toBeInTheDocument();
    expect(screen.getByText('Occupied Grid')).toBeInTheDocument();
  });

  it('passes the correct result to each card', () => {
    render(<MethodComparisonGrid {...defaultProps} />);
    // 10000 m² = 1 ha
    expect(screen.getByText(/1(\.0+)?\s*ha/i)).toBeInTheDocument();
  });

  it('marks the active card correctly', () => {
    render(
      <MethodComparisonGrid
        {...defaultProps}
        activeMethodId="connectivity10"
      />,
    );
    // The active card's button should be pressed
    const pressedButtons = screen
      .getAllByRole('button', { pressed: true })
      .filter((btn) => !btn.textContent?.toLowerCase().includes('export'));
    expect(pressedButtons.length).toBeGreaterThan(0);
  });

  it('calls onExport with the correct methodId when export is clicked', () => {
    const onExport = vi.fn();
    render(<MethodComparisonGrid {...defaultProps} onExport={onExport} />);
    const exportButtons = screen.getAllByRole('button', { name: /export/i });
    fireEvent.click(exportButtons[0]!);
    expect(onExport).toHaveBeenCalledWith('observed');
  });

  it('calls onActivate with correct methodId when a card is clicked', () => {
    const onActivate = vi.fn();
    render(<MethodComparisonGrid {...defaultProps} onActivate={onActivate} />);
    // Find the connectivity10 card container and click its main button
    const cardContainer = document.querySelector(
      '[data-method-id="connectivity10"]',
    );
    expect(cardContainer).toBeTruthy();
    const mainBtn = cardContainer?.querySelector('button[aria-pressed]');
    expect(mainBtn).toBeTruthy();
    fireEvent.click(mainBtn!);
    expect(onActivate).toHaveBeenCalledWith('connectivity10');
  });

  it('renders method card shells when isCalculating is true and no results', () => {
    render(
      <MethodComparisonGrid
        {...defaultProps}
        results={[]}
        isCalculating={true}
      />,
    );
    expect(screen.getByText('Observed Footprint')).toBeInTheDocument();
    expect(screen.getByText('10km Connectivity')).toBeInTheDocument();
    expect(screen.getByText('30km Connectivity')).toBeInTheDocument();
    expect(screen.getByText('Cluster Hull')).toBeInTheDocument();
    expect(screen.getByText('Occupied Grid')).toBeInTheDocument();
    expect(
      document.querySelector('[data-method-id="grid"]'),
    ).toBeInTheDocument();
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('uses the spec color palette for method card borders', () => {
    render(<MethodComparisonGrid {...defaultProps} />);

    expect(
      document
        .querySelector('[data-method-id="observed"] button')
        ?.getAttribute('style'),
    ).toContain('rgb(195, 91, 45)');
    expect(
      document
        .querySelector('[data-method-id="connectivity10"] button')
        ?.getAttribute('style'),
    ).toContain('rgb(15, 123, 108)');
    expect(
      document
        .querySelector('[data-method-id="connectivity30"] button')
        ?.getAttribute('style'),
    ).toContain('rgb(179, 63, 98)');
    expect(
      document
        .querySelector('[data-method-id="clusterHull"] button')
        ?.getAttribute('style'),
    ).toContain('rgb(29, 78, 216)');
    expect(
      document
        .querySelector('[data-method-id="grid"] button')
        ?.getAttribute('style'),
    ).toContain('rgb(136, 96, 208)');
  });
});
