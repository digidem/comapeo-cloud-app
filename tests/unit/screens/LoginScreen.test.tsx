import { render } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { LoginScreen } from '@/screens/LoginScreen';

describe('LoginScreen', () => {
  it('renders login text', () => {
    const { container } = render(<LoginScreen />);
    expect(container.textContent).toContain('Login');
  });
});
