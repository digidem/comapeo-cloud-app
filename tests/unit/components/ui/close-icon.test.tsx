import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { CloseIcon } from '@/components/ui/close-icon';

describe('CloseIcon', () => {
  it('uses a 20px default size and stays hidden from assistive technology', () => {
    render(<CloseIcon data-testid="close-icon" />);
    const icon = screen.getByTestId('close-icon');

    expect(icon).toHaveAttribute('width', '20');
    expect(icon).toHaveAttribute('height', '20');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('supports the smaller sizes used by close buttons', () => {
    render(<CloseIcon data-testid="close-icon" size={15} />);
    const icon = screen.getByTestId('close-icon');

    expect(icon).toHaveAttribute('width', '15');
    expect(icon).toHaveAttribute('height', '15');
  });
});
