import { render, screen } from '@tests/mocks/test-utils';
import { userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { Tooltip } from '@/components/ui/tooltip';

describe('Tooltip', () => {
  it('renders trigger (children)', () => {
    render(<Tooltip content="Tip text">Hover me</Tooltip>);
    expect(screen.getByText('Hover me')).toBeInTheDocument();
  });

  it('content is present in DOM after hover', async () => {
    const user = userEvent.setup();
    render(<Tooltip content="Hello tooltip">Trigger</Tooltip>);
    await user.hover(screen.getByText('Trigger'));
    // Radix renders tooltip text twice: once visible, once as hidden aria description
    const texts = screen.getAllByText('Hello tooltip');
    expect(texts.length).toBeGreaterThanOrEqual(1);
  });

  it('applies side prop', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Bottom tip" side="bottom">
        Trigger
      </Tooltip>,
    );
    await user.hover(screen.getByText('Trigger'));
    // Find the visible tooltip content (not the hidden aria one)
    const tooltipContents = screen.getAllByText('Bottom tip');
    const visibleContent = tooltipContents.find(
      (el) => !el.hasAttribute('style') || !el.style.position,
    );
    expect(visibleContent?.closest('[data-side]')).toHaveAttribute(
      'data-side',
      'bottom',
    );
  });
});
