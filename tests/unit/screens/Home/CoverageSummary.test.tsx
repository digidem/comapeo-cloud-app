import { fireEvent, render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import type { CoverageMethodResult } from '@/hooks/useProjectCoverage';
import type { CalculationResult } from '@/lib/area-calculator/types';
import { CoverageSummary } from '@/screens/Home/CoverageSummary';

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

describe('CoverageSummary', () => {
  const results: CoverageMethodResult[] = [makeResult('observed', 50000)];

  it('shows area in ha by default (converted from areaM2)', () => {
    render(
      <CoverageSummary
        activeMethodId="observed"
        results={results}
        isCalculating={false}
      />,
    );
    // 50000 m² = 5 ha
    expect(screen.getByText(/5(\.0+)?\s*ha/i)).toBeInTheDocument();
  });

  it('clicking m² shows area in m²', () => {
    render(
      <CoverageSummary
        activeMethodId="observed"
        results={results}
        isCalculating={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'm²' }));
    expect(screen.getByText(/50[.,\s]?000/)).toBeInTheDocument();
  });

  it('clicking km² shows area in km²', () => {
    render(
      <CoverageSummary
        activeMethodId="observed"
        results={results}
        isCalculating={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'km²' }));
    // 50000 m² = 0.05 km²
    expect(screen.getByText(/0\.05/)).toBeInTheDocument();
  });

  it('shows "—" when no result for the active method', () => {
    render(
      <CoverageSummary
        activeMethodId="observed"
        results={[]}
        isCalculating={false}
      />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows loading indicator when isCalculating', () => {
    render(
      <CoverageSummary
        activeMethodId="observed"
        results={[]}
        isCalculating={true}
      />,
    );
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  });

  it('shows ha button as active by default', () => {
    render(
      <CoverageSummary
        activeMethodId="observed"
        results={results}
        isCalculating={false}
      />,
    );
    const haButton = screen.getByRole('button', { name: /ha/i });
    expect(haButton).toHaveAttribute('aria-pressed', 'true');
  });
});
