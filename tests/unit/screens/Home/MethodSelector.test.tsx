import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CoverageMethodResult } from '@/hooks/useProjectCoverage';

// Mock scrollIntoView which is not available in jsdom
Element.prototype.scrollIntoView = vi.fn();

/**
 * Patch METHOD_IDS to include an entry not in METHOD_META so the
 * `if (!meta) return null` guard is exercised in the real MethodSelector
 * component with proper source coverage tracking.
 *
 * We mock the method-ids module (not the component itself) so the real
 * MethodSelector receives the patched METHOD_IDS through its import
 * binding. This gives us true branch coverage on line 80.
 */
vi.mock('@/screens/Home/method-ids', () => ({
  METHOD_IDS: [
    'invalid-method',
    'observed',
    'connectivity10',
    'connectivity30',
    'clusterHull',
    'grid',
  ],
}));

import { MethodSelector } from '@/screens/Home/MethodSelector';

function makeResult(
  methodId: string,
  areaM2: number,
): CoverageMethodResult {
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
    },
  };
}

describe('MethodSelector', () => {
  const results: CoverageMethodResult[] = [
    makeResult('observed', 50000),
    makeResult('grid', 120000),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Map Layer label and export button', () => {
    render(
      <MethodSelector
        results={results}
        activeMethodId="observed"
        onActivate={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    expect(screen.getByText('Map Layer')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Export map layer' }),
    ).toBeInTheDocument();
  });

  it('renders all 5 valid method options in the select dropdown', async () => {
    const user = userEvent.setup();

    render(
      <MethodSelector
        results={results}
        activeMethodId="observed"
        onActivate={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    // Radix Select renders items in a portal; query the full document
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

  it('does NOT render options for method IDs missing from METHOD_META', async () => {
    const user = userEvent.setup();

    render(
      <MethodSelector
        results={results}
        activeMethodId="observed"
        onActivate={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    // 'invalid-method' is in the patched METHOD_IDS but not METHOD_META,
    // so the !meta null-return branch was hit and no option rendered
    expect(
      screen.queryByRole('option', { name: /invalid/i }),
    ).not.toBeInTheDocument();
  });

  it('disables the export button when active method has no result', () => {
    render(
      <MethodSelector
        results={[]}
        activeMethodId="observed"
        onActivate={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    const exportButton = screen.getByRole('button', {
      name: 'Export map layer',
    });
    expect(exportButton).toBeDisabled();
  });

  it('enables the export button when active method has a result', () => {
    render(
      <MethodSelector
        results={results}
        activeMethodId="observed"
        onActivate={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    const exportButton = screen.getByRole('button', {
      name: 'Export map layer',
    });
    expect(exportButton).not.toBeDisabled();
  });

  it('calls onActivate when a different method is selected', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();

    render(
      <MethodSelector
        results={results}
        activeMethodId="observed"
        onActivate={onActivate}
        onExport={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    const gridOption = screen.getByRole('option', { name: 'Occupied Grid' });
    await user.click(gridOption);

    expect(onActivate).toHaveBeenCalledWith('grid');
  });

  it('calls onExport when the export button is clicked', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();

    render(
      <MethodSelector
        results={results}
        activeMethodId="observed"
        onActivate={vi.fn()}
        onExport={onExport}
      />,
    );

    const exportButton = screen.getByRole('button', {
      name: 'Export map layer',
    });
    await user.click(exportButton);

    expect(onExport).toHaveBeenCalledOnce();
  });
});
