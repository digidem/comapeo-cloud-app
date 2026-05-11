import { render, screen } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';

import { resetDb } from '@/lib/db';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { useAuthStore } from '@/stores/auth-store';

beforeEach(async () => {
  await resetDb();
  useAuthStore.setState({
    servers: [],
    activeServerId: null,
    token: null,
    baseUrl: null,
  });
});

describe('SettingsScreen', () => {
  it('renders the settings heading', () => {
    render(<SettingsScreen />);
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
  });

  it('renders language selector buttons', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('Português')).toBeInTheDocument();
    expect(screen.getByText('Español')).toBeInTheDocument();
  });
});
