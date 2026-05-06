import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { Skeleton } from '@/components/ui/skeleton';

describe('Skeleton', () => {
  it('renders with width and height', () => {
    render(<Skeleton width={200} height={40} />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton).toHaveStyle({ width: '200px', height: '40px' });
  });

  it('has animate-pulse class', () => {
    render(<Skeleton width={100} height={20} />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton.className).toContain('animate-pulse');
  });

  it('applies className', () => {
    render(<Skeleton width={100} height={20} className="extra-class" />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton.className).toContain('extra-class');
  });

  it('has default dimensions when not specified', () => {
    render(<Skeleton />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton).toHaveStyle({ width: '100%', height: '16px' });
  });

  it('has rounded and gray background classes', () => {
    render(<Skeleton width={100} height={20} />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton.className).toContain('rounded');
    expect(skeleton.className).toContain('bg-gray-200');
  });
});
