import { render } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { DashboardScreen } from '@/screens/DashboardScreen';

describe('DashboardScreen', () => {
  it('renders dashboard text', () => {
    const { container } = render(<DashboardScreen />);
    expect(container.textContent).toContain('Dashboard');
  });
});
