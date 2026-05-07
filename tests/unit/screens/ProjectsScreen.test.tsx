import { render } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { ProjectsScreen } from '@/screens/ProjectsScreen';

describe('ProjectsScreen', () => {
  it('renders projects text', () => {
    const { container } = render(<ProjectsScreen />);
    expect(container.textContent).toContain('Projects');
  });
});
