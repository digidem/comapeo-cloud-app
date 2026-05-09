import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { BUILT_IN_PRESETS, DEFAULTS } from '@/lib/area-calculator/config';
import { CalculationSettings } from '@/screens/Home/CalculationSettings';

// Radix Select uses scrollIntoView internally which jsdom doesn't support
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('CalculationSettings', () => {
  const defaultProps = {
    presets: BUILT_IN_PRESETS,
    selectedPresetId: BUILT_IN_PRESETS[0]!.id,
    params: { ...DEFAULTS },
    onPresetChange: vi.fn(),
    onParamsChange: vi.fn(),
  };

  it('renders preset options', async () => {
    const user = userEvent.setup();
    render(<CalculationSettings {...defaultProps} />);

    await user.click(screen.getByRole('combobox'));

    for (const preset of BUILT_IN_PRESETS) {
      expect(screen.getByRole('option', { name: preset.label })).toBeDefined();
    }
  });

  it('labels presets as calculation presets', () => {
    render(<CalculationSettings {...defaultProps} />);

    expect(screen.getByText('Calculation Preset')).toBeInTheDocument();
    expect(screen.queryByText('Preset')).not.toBeInTheDocument();
  });

  it('advanced section is collapsed by default', () => {
    render(<CalculationSettings {...defaultProps} />);

    expect(screen.queryByLabelText(/observedBufferMeters/i)).toBeNull();
    expect(screen.queryByLabelText(/gridCellKm/i)).toBeNull();
  });

  it('clicking Advanced toggle shows param fields', async () => {
    const user = userEvent.setup();
    render(<CalculationSettings {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /advanced/i }));

    expect(screen.getByLabelText(/observedBufferMeters/i)).toBeDefined();
    expect(screen.getByLabelText(/gridCellKm/i)).toBeDefined();
  });

  it('calls onParamsChange when a param field is changed', async () => {
    const user = userEvent.setup();
    const onParamsChange = vi.fn();

    render(
      <CalculationSettings {...defaultProps} onParamsChange={onParamsChange} />,
    );

    await user.click(screen.getByRole('button', { name: /advanced/i }));

    const input = screen.getByLabelText(/gridCellKm/i);
    await user.clear(input);
    await user.type(input, '10');

    expect(onParamsChange).toHaveBeenCalled();
  });
});
