import { render, screen, waitFor } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { App } from '@/app/App';

describe('App', () => {
  it('renders the root route content', async () => {
    render(<App />);
    // Root route now renders <Outlet /> which delegates to the '/' homeRoute
    // HomeScreen is rendered at '/' — it shows the app shell navigation
    await waitFor(() => {
      const nav = screen.getByRole('navigation', {
        name: 'Primary navigation',
      });
      expect(nav).toBeDefined();
    });
  });
});
