import { render, screen, userEvent, waitFor } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { ZoomSelector } from '@/screens/MapScreen/ZoomSelector';

describe('ZoomSelector', () => {
  it('emits min and max zoom changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ZoomSelector value={{ minZoom: 0, maxZoom: 14 }} onChange={onChange} />,
    );

    await user.clear(screen.getByLabelText('Minimum zoom'));
    await user.type(screen.getByLabelText('Minimum zoom'), '3');

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith({ minZoom: 3, maxZoom: 14 });
    });

    await user.clear(screen.getByLabelText('Maximum zoom'));
    await user.type(screen.getByLabelText('Maximum zoom'), '16');

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith({ minZoom: 3, maxZoom: 16 });
    });
  });

  it('shows an inline error when max zoom is lower than min zoom', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ZoomSelector value={{ minZoom: 10, maxZoom: 14 }} onChange={onChange} />,
    );

    await user.clear(screen.getByLabelText('Maximum zoom'));
    await user.type(screen.getByLabelText('Maximum zoom'), '9');

    expect(
      screen.getByText('Max zoom must be greater than or equal to min zoom'),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalledWith({ minZoom: 10, maxZoom: 9 });
  });
});
