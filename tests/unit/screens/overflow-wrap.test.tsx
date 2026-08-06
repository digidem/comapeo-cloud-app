/**
 * Structural overflow guard for issue #155.
 *
 * jsdom does not run a real layout engine — `scrollWidth`/`clientWidth`
 * are hardcoded to 0 on every element, so asserting
 * `documentElement.scrollWidth <= documentElement.clientWidth` here would
 * always pass trivially (0 <= 0), regardless of whether wrapping is
 * actually applied. That would be a fake test.
 *
 * Instead, these tests assert the CSS contract that prevents overflow
 * (`break-words` + `wrap-anywhere`, no `truncate`) on the elements that
 * render unbounded, unbreakable strings (invite codes, observation
 * names, tag values). The real, rendered-in-a-browser overflow
 * assertion is covered by the visual-regression screenshot CI job
 * (Argos snapshots under screenshots/screenshot/*.argos.json).
 */
import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDb } from '@/lib/db';
import { DataScreen } from '@/screens/DataScreen';
import { ObservationDetailScreen } from '@/screens/ObservationDetailScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { useAuthStore } from '@/stores/auth-store';
import { useViewModeStore } from '@/stores/view-mode-store';

vi.mock('@/lib/local-storage-utils', () => ({
  exportLocalStorageData: vi.fn(() => '"{\\"version\\":1,\\"data\\":{}}"'),
  importLocalStorageData: vi.fn(() => ({ success: true })),
  clearAllStorage: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/components/layout/shell-slot', () => ({
  useShellSlot: vi.fn(),
}));

let mockSelectedProjectId: string | null = 'proj-1';
vi.mock('@/stores/project-store', () => ({
  useProjectStore: vi.fn(
    (selector: (s: { selectedProjectId: string | null }) => string | null) =>
      selector({ selectedProjectId: mockSelectedProjectId }),
  ),
}));

vi.mock('@/hooks/useProjects', () => ({
  useProjects: vi.fn(() => ({
    data: [{ localId: 'proj-1', name: 'Test Project' }],
    isPending: false,
  })),
}));

const LONG_NAME =
  'Extremely-long-observation-name-with-no-spaces-that-would-otherwise-force-horizontal-overflow-on-narrow-viewports-abcdefghijklmnopqrstuvwxyz0123456789';

let mockObservationsData: unknown[] = [];
vi.mock('@/hooks/useObservations', () => ({
  useObservations: vi.fn(() => ({
    data: mockObservationsData,
    isPending: false,
    isError: false,
    error: null,
  })),
}));

let mockDisplayNamesByObservationId = new Map<string, string>();
vi.mock('@/hooks/useObservationCategoryMetadata', () => ({
  useObservationCategoryMetadata: vi.fn(() => ({
    categories: [],
    categoryByObservationId: new Map(),
    displayNamesByObservationId: mockDisplayNamesByObservationId,
  })),
}));

vi.mock('@/components/shared/auth-img', () => ({
  AuthImg: ({ src, alt }: { src: string; alt: string }) => (
    <img data-testid="auth-img" src={src} alt={alt} />
  ),
}));

vi.mock('@/components/shared/ExportObservationsButton', () => ({
  ExportObservationsButton: () => <button>Export</button>,
}));

vi.mock('@/components/shared/ObservationsMap', () => ({
  ObservationsMap: () => <div data-testid="observations-map" />,
}));

let mockObservationId = 'obs-1';
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useParams: () => ({ observationId: mockObservationId }),
}));

describe('overflow guard: SettingsScreen invite code (issue #155)', () => {
  beforeEach(async () => {
    await resetDb();
    useAuthStore.setState({
      servers: [],
      activeServerId: null,
      token: null,
      baseUrl: null,
    });
  });

  it('wraps a long generated invite code instead of overflowing', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);

    // A long URL + token forces a long base64 invite code from the mock
    // /api/invites/encrypt handler. Pasting (rather than typing keystroke
    // by keystroke) keeps this fast enough to stay under the test timeout.
    await user.click(screen.getByLabelText('Remote Archive URL'));
    await user.paste(`https://${'archive-subdomain-'.repeat(10)}example.com`);
    await user.click(screen.getByLabelText('Bearer Token'));
    await user.paste('x'.repeat(500));
    await user.click(screen.getByRole('button', { name: 'Generate Invite' }));

    await screen.findByText('Results');
    const inviteCode = await screen.findByText(/^mock-encrypted-code-/, {
      selector: 'code',
    });

    expect(inviteCode).not.toHaveClass('truncate');
    expect(inviteCode).toHaveClass('break-words', 'wrap-anywhere', 'min-w-0');
  });
});

describe('overflow guard: DataScreen observation name (issue #155)', () => {
  beforeEach(() => {
    mockSelectedProjectId = 'proj-1';
    mockObservationsData = [
      {
        localId: 'obs-1',
        projectLocalId: 'proj-1',
        tags: { category: LONG_NAME },
        createdAt: '2024-03-15T10:30:00Z',
        updatedAt: '2024-03-15T10:30:00Z',
      },
    ];
    mockDisplayNamesByObservationId = new Map([['obs-1', LONG_NAME]]);
    useViewModeStore.setState({ viewMode: 'grid' });
  });

  it('wraps a long observation name instead of overflowing', () => {
    render(<DataScreen />);

    const nameSpan = screen.getByText(LONG_NAME, { selector: 'span' });
    expect(nameSpan).not.toHaveClass('truncate');
    expect(nameSpan).toHaveClass('break-words', 'wrap-anywhere');
  });
});

describe('overflow guard: ObservationDetailScreen tag value (issue #155)', () => {
  beforeEach(() => {
    mockSelectedProjectId = 'proj-1';
    mockObservationId = 'obs-1';
    mockObservationsData = [
      {
        localId: 'obs-1',
        projectLocalId: 'proj-1',
        tags: { category: 'Wildlife', notes: LONG_NAME },
        lat: 10.5,
        lon: -85.2,
        createdAt: '2026-01-15T00:00:00Z',
        updatedAt: '2026-01-15T12:00:00Z',
      },
    ];
  });

  it('wraps a long tag value instead of overflowing', () => {
    render(<ObservationDetailScreen />);

    const tagPill = screen.getByText(new RegExp(`notes.*${LONG_NAME}`));
    expect(tagPill).not.toHaveClass('truncate');
    expect(tagPill).toHaveClass('break-words', 'wrap-anywhere', 'max-w-full');
  });
});
