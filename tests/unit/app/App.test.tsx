import { render, screen, waitFor } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { App } from '@/app/App';

describe('App', () => {
  it('renders the root route content', async () => {
    render(<App />);
    await waitFor(() => {
      const roots = screen.getAllByText('Root');
      expect(roots.length).toBeGreaterThanOrEqual(1);
    });
  });
});
