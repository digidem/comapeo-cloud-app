import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { App } from '@/app/App';

describe('App', () => {
  it('renders the app title', () => {
    render(<App />);
    expect(screen.getByText('CoMapeo Cloud')).toBeInTheDocument();
  });
});
