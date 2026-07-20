import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { DrawBoundsControl } from '@/screens/MapScreen/DrawBoundsControl';

describe('DrawBoundsControl', () => {
  it('renders with inactive state and draw-bounds label when idle', () => {
    render(<DrawBoundsControl drawMode={null} onDrawModeChange={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Draw bounds' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders with active state and cancel label when currently drawing', () => {
    render(
      <DrawBoundsControl
        drawMode="draw_rectangle"
        onDrawModeChange={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: 'Cancel drawing' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onDrawModeChange with draw_rectangle when clicked while idle', async () => {
    const user = userEvent.setup();
    const onDrawModeChange = vi.fn();

    render(
      <DrawBoundsControl drawMode={null} onDrawModeChange={onDrawModeChange} />,
    );

    await user.click(screen.getByRole('button', { name: 'Draw bounds' }));
    expect(onDrawModeChange).toHaveBeenCalledWith('draw_rectangle');
  });

  it('calls onDrawModeChange with simple_select when clicked while drawing', async () => {
    const user = userEvent.setup();
    const onDrawModeChange = vi.fn();

    render(
      <DrawBoundsControl
        drawMode="draw_rectangle"
        onDrawModeChange={onDrawModeChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel drawing' }));
    expect(onDrawModeChange).toHaveBeenCalledWith('simple_select');
  });

  it('has Tailwind touch-target sizing classes for 44x44px minimum', () => {
    render(<DrawBoundsControl drawMode={null} onDrawModeChange={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Draw bounds' });
    expect(button.className).toMatch(/\bh-11\b/);
    expect(button.className).toMatch(/\bw-11\b/);
  });
});
