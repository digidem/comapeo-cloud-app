import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { Separator } from '@/components/ui/separator';

describe('Separator', () => {
  it('renders horizontal by default', () => {
    render(<Separator />);
    const separator = screen.getByRole('none');
    expect(separator).toHaveAttribute('data-orientation', 'horizontal');
    expect(separator.className).toContain('w-full');
    expect(separator.className).toContain('h-px');
  });

  it('renders vertical when prop set', () => {
    render(<Separator orientation="vertical" />);
    const separator = screen.getByRole('none');
    expect(separator).toHaveAttribute('data-orientation', 'vertical');
    expect(separator.className).toContain('h-full');
    expect(separator.className).toContain('w-px');
  });

  it('has correct ARIA attributes when decorative is false', () => {
    render(<Separator decorative={false} />);
    // When decorative=false, Radix exposes role="separator" (not role="none")
    const separator = screen.getByRole('separator');
    expect(separator).toHaveAttribute('data-orientation', 'horizontal');
  });

  it('applies className', () => {
    render(<Separator className="my-custom-class" />);
    expect(screen.getByRole('none').className).toContain('my-custom-class');
  });
});
