import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { ObservationDetailScreen } from '@/screens/ObservationDetailScreen';

let mockObservationId = 'obs-1';
let mockObservationsData: unknown[] = [
  {
    localId: 'obs-1',
    projectLocalId: 'proj-1',
    tags: { category: 'Wildlife', notes: 'Eagle sighting' },
    lat: 10.5,
    lon: -85.2,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T12:00:00Z',
  },
];
let mockObservationsIsPending = false;

vi.mock('@/components/layout/shell-slot', () => ({
  useShellSlot: vi.fn(),
}));

vi.mock('@/hooks/useObservations', () => ({
  useObservations: vi.fn(() => ({
    data: mockObservationsData,
    isPending: mockObservationsIsPending,
    error: null,
  })),
}));

vi.mock('@/hooks/useProjects', () => ({
  useProjects: vi.fn(() => ({
    data: [{ localId: 'proj-1', name: 'Test Project' }],
    isPending: false,
  })),
}));

vi.mock('@/stores/project-store', () => ({
  useProjectStore: vi.fn(
    (selector: (s: { selectedProjectId: string | null }) => string | null) =>
      selector({ selectedProjectId: 'proj-1' }),
  ),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useParams: () => ({ observationId: mockObservationId }),
}));

function resetMocks() {
  mockObservationId = 'obs-1';
  mockObservationsData = [
    {
      localId: 'obs-1',
      projectLocalId: 'proj-1',
      tags: { category: 'Wildlife', notes: 'Eagle sighting' },
      lat: 10.5,
      lon: -85.2,
      createdAt: '2026-01-15T00:00:00Z',
      updatedAt: '2026-01-15T12:00:00Z',
    },
  ];
  mockObservationsIsPending = false;
}

describe('ObservationDetailScreen', () => {
  it('renders observation category as title', () => {
    resetMocks();
    render(<ObservationDetailScreen />);
    expect(screen.getByText('Wildlife')).toBeInTheDocument();
  });

  it('renders location with coordinates', () => {
    resetMocks();
    render(<ObservationDetailScreen />);
    expect(screen.getByText(/10\.500000.*-85\.200000/)).toBeInTheDocument();
  });

  it('renders tags', () => {
    resetMocks();
    render(<ObservationDetailScreen />);
    expect(screen.getByText(/category.*Wildlife/)).toBeInTheDocument();
    expect(screen.getByText(/notes.*Eagle sighting/)).toBeInTheDocument();
  });

  it('renders back link', () => {
    resetMocks();
    render(<ObservationDetailScreen />);
    expect(screen.getByText('Back to Data')).toBeInTheDocument();
  });

  it('renders created date', () => {
    resetMocks();
    render(<ObservationDetailScreen />);
    expect(screen.getByText(/Created/)).toBeInTheDocument();
  });

  it('renders "Observation not found" when observation ID does not match', () => {
    resetMocks();
    mockObservationId = 'nonexistent';
    render(<ObservationDetailScreen />);
    expect(screen.getByText('Observation not found')).toBeInTheDocument();
  });

  it('renders "No location data" when lat/lon are undefined', () => {
    resetMocks();
    mockObservationsData = [
      {
        localId: 'obs-1',
        projectLocalId: 'proj-1',
        tags: { category: 'Bird' },
        createdAt: '2026-01-15T00:00:00Z',
        updatedAt: '2026-01-15T12:00:00Z',
      },
    ];
    render(<ObservationDetailScreen />);
    expect(screen.getByText('No location data')).toBeInTheDocument();
  });

  it('renders "Observation" fallback when tags are undefined', () => {
    resetMocks();
    mockObservationsData = [
      {
        localId: 'obs-1',
        projectLocalId: 'proj-1',
        tags: undefined,
        lat: 10.5,
        lon: -85.2,
        createdAt: '2026-01-15T00:00:00Z',
        updatedAt: '2026-01-15T12:00:00Z',
      },
    ];
    render(<ObservationDetailScreen />);
    expect(screen.getByText('Observation')).toBeInTheDocument();
    // No tags card should be rendered
    expect(screen.queryByText('Tags')).not.toBeInTheDocument();
  });

  it('renders observation with tags but no category field', () => {
    resetMocks();
    mockObservationsData = [
      {
        localId: 'obs-1',
        projectLocalId: 'proj-1',
        tags: { notes: 'Some notes', priority: 'high' },
        lat: 10.5,
        lon: -85.2,
        createdAt: '2026-01-15T00:00:00Z',
        updatedAt: '2026-01-15T12:00:00Z',
      },
    ];
    render(<ObservationDetailScreen />);
    // Falls back to "Observation" since no category tag
    expect(screen.getByText('Observation')).toBeInTheDocument();
    // Tags card still renders
    expect(screen.getByText(/notes.*Some notes/)).toBeInTheDocument();
  });
});
