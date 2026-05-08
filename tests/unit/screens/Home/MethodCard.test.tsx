import { fireEvent, render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { CoverageMethodResult } from '@/hooks/useProjectCoverage';
import type { CalculationResult } from '@/lib/area-calculator/types';
import { MethodCard } from '@/screens/Home/MethodCard';

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

const defaultProps = {
  methodId: 'observed',
  label: 'Observed Footprint',
  description: 'Buffer around each observation',
  isActive: false,
  unit: 'ha' as const,
  onActivate: vi.fn(),
};

describe('MethodCard', () => {
  it('renders label and description', () => {
    render(<MethodCard {...defaultProps} />);
    expect(screen.getByText('Observed Footprint')).toBeInTheDocument();
    expect(
      screen.getByText('Buffer around each observation'),
    ).toBeInTheDocument();
  });

  it('shows formatted area when result is available', () => {
    render(
      <MethodCard
        {...defaultProps}
        result={makeResult('observed', 30000)}
        unit="ha"
      />,
    );
    // 30000 m² = 3 ha
    expect(screen.getByText(/3(\.0+)?\s*ha/i)).toBeInTheDocument();
  });

  it('clicking the card calls onActivate with methodId', () => {
    const onActivate = vi.fn();
    render(<MethodCard {...defaultProps} onActivate={onActivate} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onActivate).toHaveBeenCalledWith('observed');
  });

  it('shows export button when result is available and calls onExport', () => {
    const onExport = vi.fn();
    render(
      <MethodCard
        {...defaultProps}
        result={makeResult('observed', 10000)}
        onExport={onExport}
      />,
    );
    const exportBtn = screen.getByRole('button', { name: /export/i });
    fireEvent.click(exportBtn);
    expect(onExport).toHaveBeenCalledWith('observed');
  });

  it('does not show export button when no result', () => {
    render(<MethodCard {...defaultProps} />);
    expect(
      screen.queryByRole('button', { name: /export/i }),
    ).not.toBeInTheDocument();
  });

  it('shows error message when result has error', () => {
    const errorResult: CoverageMethodResult = {
      methodId: 'observed',
      error: 'Calculation failed',
    };
    render(<MethodCard {...defaultProps} result={errorResult} />);
    expect(screen.getByText(/calculation failed/i)).toBeInTheDocument();
  });

  it('active card has aria-pressed true', () => {
    render(<MethodCard {...defaultProps} isActive={true} />);
    expect(screen.getByRole('button', { pressed: true })).toBeInTheDocument();
  });

  it('inactive card has aria-pressed false', () => {
    render(<MethodCard {...defaultProps} isActive={false} />);
    expect(screen.getByRole('button', { pressed: false })).toBeInTheDocument();
  });
});
