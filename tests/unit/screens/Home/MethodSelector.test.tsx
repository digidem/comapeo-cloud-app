import { render, screen } from '@tests/mocks/test-utils';
import { userEvent } from '@tests/mocks/test-utils';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { CoverageMethodResult } from '@/hooks/useProjectCoverage';
import { MethodSelector } from '@/screens/Home/MethodSelector';

// Radix Select uses scrollIntoView internally which jsdom doesn't support
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const mockResults: CoverageMethodResult[] = [
  {
    methodId: 'observed',
    result: {
      id: 'observed',
      label: 'Observed Footprint',
      description: 'test',
      featureCollection: { type: 'FeatureCollection', features: [] },
      previewFeatureCollection: { type: 'FeatureCollection', features: [] },
      areaM2: 50000,
      metadata: {},
    },
  },
  { methodId: 'connectivity10' },
  { methodId: 'connectivity30' },
  { methodId: 'clusterHull' },
  { methodId: 'grid' },
];

describe('MethodSelector', () => {
  it('renders Map Layer label and select with all 5 method options', async () => {
    const user = userEvent.setup();
    render(
      <MethodSelector
        results={mockResults}
        activeMethodId="observed"
        onActivate={() => {}}
        onExport={() => {}}
      />,
    );

    expect(screen.getByText('Map Layer')).toBeVisible();

    // Open the select dropdown
    await user.click(screen.getByRole('combobox'));

    // Verify all 5 method options are present
    expect(
      screen.getByRole('option', { name: 'Observed Footprint' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: '10km Connectivity' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: '30km Connectivity' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Cluster Hull' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Occupied Grid' }),
    ).toBeInTheDocument();
  });

  it('calls onActivate when a method is selected', async () => {
    const handleActivate = vi.fn();
    const user = userEvent.setup();
    render(
      <MethodSelector
        results={mockResults}
        activeMethodId="observed"
        onActivate={handleActivate}
        onExport={() => {}}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: '10km Connectivity' }));

    expect(handleActivate).toHaveBeenCalledWith('connectivity10');
  });

  it('calls onExport when export button clicked', async () => {
    const handleExport = vi.fn();
    const user = userEvent.setup();
    render(
      <MethodSelector
        results={mockResults}
        activeMethodId="observed"
        onActivate={() => {}}
        onExport={handleExport}
      />,
    );

    // "observed" has a result, so export button should be enabled
    const exportButton = screen.getByRole('button', {
      name: 'Export map layer',
    });
    expect(exportButton).toBeEnabled();

    await user.click(exportButton);
    expect(handleExport).toHaveBeenCalledOnce();
  });

  it('export button is disabled when no result exists for active method', () => {
    render(
      <MethodSelector
        results={mockResults}
        activeMethodId="connectivity10"
        onActivate={() => {}}
        onExport={() => {}}
      />,
    );

    // "connectivity10" has no result in mockResults (only methodId, no result property)
    const exportButton = screen.getByRole('button', {
      name: 'Export map layer',
    });
    expect(exportButton).toBeDisabled();
  });
});
