import { render, screen } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';

import { resetDb } from '@/lib/db';
import { SettingsScreen } from '@/screens/SettingsScreen';

beforeEach(async () => {
  await resetDb();
});

describe('SettingsScreen — archive server section', () => {
  it('renders the settings heading', () => {
    render(<SettingsScreen />);
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
  });

  it('displays archive server section', () => {
    render(<SettingsScreen />);
    const section = screen.getByRole('region');
    expect(section).toBeDefined();
  });

  it('shows add server form', () => {
    render(<SettingsScreen />);
    // The form should have at least an input and a submit button
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThan(0);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
