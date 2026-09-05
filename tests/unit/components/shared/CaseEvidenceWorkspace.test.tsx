import userEvent from '@testing-library/user-event';
import { render, screen } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CaseEvidenceWorkspace } from '@/components/shared/CaseEvidenceWorkspace';

const addMutate = vi.fn();
const removeMutate = vi.fn();
const attachmentMutate = vi.fn();

const observation = {
  localId: 'obs-1',
  projectLocalId: 'project-1',
  sourceType: 'local',
  sourceId: 'local',
  tags: { category: 'Deforestation' },
  lat: -3.1,
  lon: -60.1,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-02T10:00:00.000Z',
  dirtyLocal: true,
  deleted: false,
};
const alert = {
  localId: 'alert-1',
  projectLocalId: 'project-1',
  sourceType: 'local',
  sourceId: 'local',
  metadata: { alert_type: 'Fire alert' },
  geometry: { type: 'Point', coordinates: [-60.2, -3.2] },
  createdAt: '2026-09-02T10:00:00.000Z',
  updatedAt: '2026-09-02T10:00:00.000Z',
  dirtyLocal: false,
  deleted: false,
};
const deletedAlert = {
  ...alert,
  localId: 'alert-deleted',
  metadata: { alert_type: 'Deleted fire alert' },
  updatedAt: '2026-09-04T10:00:00.000Z',
  deleted: true,
};
const track = {
  localId: 'track-1',
  projectLocalId: 'project-1',
  sourceType: 'local',
  sourceId: 'local',
  tags: { name: 'River patrol' },
  locations: [
    {
      coords: { latitude: -3.3, longitude: -60.3 },
      timestamp: '2026-09-03T10:00:00.000Z',
    },
  ],
  observationRefs: [],
  createdAt: '2026-09-03T10:00:00.000Z',
  updatedAt: '2026-09-03T10:00:00.000Z',
  dirtyLocal: false,
  deleted: false,
};

vi.mock('@/hooks/useObservations', () => ({
  useObservations: vi.fn(() => ({ data: [observation], isPending: false })),
}));
vi.mock('@/hooks/useAlerts', () => ({
  useAlerts: vi.fn(() => ({ data: [alert], isPending: false })),
}));
vi.mock('@/hooks/useTracks', () => ({
  useTracks: vi.fn(() => ({ data: [track], isPending: false })),
}));
vi.mock('@/hooks/useAttachmentsForProject', () => ({
  useAttachmentsForProject: vi.fn(() => ({
    data: [
      {
        localId: 'photo-1',
        projectLocalId: 'project-1',
        observationLocalId: 'obs-1',
        sourceType: 'local',
        sourceId: 'local',
        mediaType: 'photo',
        name: 'evidence.jpg',
        hash: 'hash-1',
        downloadStatus: 'available',
        createdAt: '2026-09-01T10:00:00.000Z',
        updatedAt: '2026-09-01T10:00:00.000Z',
        dirtyLocal: false,
        deleted: false,
      },
      {
        localId: 'audio-1',
        projectLocalId: 'project-1',
        observationLocalId: 'obs-1',
        sourceType: 'local',
        sourceId: 'local',
        mediaType: 'audio',
        name: 'evidence.mp3',
        downloadStatus: 'remote-only',
        createdAt: '2026-09-01T10:00:00.000Z',
        updatedAt: '2026-09-01T10:00:00.000Z',
        dirtyLocal: false,
        deleted: false,
      },
      {
        localId: 'photo-deleted',
        projectLocalId: 'project-1',
        observationLocalId: 'obs-1',
        sourceType: 'local',
        sourceId: 'local',
        mediaType: 'photo',
        name: 'deleted-evidence.jpg',
        hash: 'hash-deleted-new',
        downloadStatus: 'available',
        createdAt: '2026-09-01T10:00:00.000Z',
        updatedAt: '2026-09-04T10:00:00.000Z',
        dirtyLocal: false,
        deleted: true,
      },
    ],
    isPending: false,
  })),
}));
vi.mock('@/hooks/useCaseEvidence', () => ({
  useCaseEvidence: vi.fn(() => ({
    data: [
      {
        localId: 'evidence-obs',
        caseLocalId: 'case-1',
        projectLocalId: 'project-1',
        sourceType: 'observation',
        sourceLocalId: 'obs-1',
        sourceUpdatedAt: '2026-09-01T10:00:00.000Z',
        addedAt: '2026-09-01T11:00:00.000Z',
        updatedAt: '2026-09-01T11:00:00.000Z',
        availability: 'available',
        freshness: 'changed',
        syncState: 'unsynced',
      },
      {
        localId: 'evidence-deleted-alert',
        caseLocalId: 'case-1',
        projectLocalId: 'project-1',
        sourceType: 'alert',
        sourceLocalId: 'alert-deleted',
        sourceUpdatedAt: '2026-09-02T10:00:00.000Z',
        addedAt: '2026-09-02T11:00:00.000Z',
        updatedAt: '2026-09-02T11:00:00.000Z',
        availability: 'deleted',
        freshness: 'changed',
        syncState: 'synced',
        source: deletedAlert,
      },
    ],
    isPending: false,
    isError: false,
  })),
}));
vi.mock('@/hooks/useCaseEvidenceAttachments', () => ({
  useCaseEvidenceAttachments: vi.fn(() => ({
    data: [
      {
        localId: 'selected-photo',
        caseLocalId: 'case-1',
        projectLocalId: 'project-1',
        evidenceLocalId: 'evidence-obs',
        attachmentLocalId: 'photo-1',
        originalHash: 'hash-1',
        mediaType: 'photo',
        sourceUpdatedAt: '2026-09-01T10:00:00.000Z',
        selectedAt: '2026-09-01T12:00:00.000Z',
        availability: 'available',
        freshness: 'current',
        syncState: 'synced',
        downloadStatus: 'available',
        name: 'evidence.jpg',
      },
      {
        localId: 'selected-deleted-photo',
        caseLocalId: 'case-1',
        projectLocalId: 'project-1',
        evidenceLocalId: 'evidence-obs',
        attachmentLocalId: 'photo-deleted',
        originalHash: 'hash-deleted-old',
        mediaType: 'photo',
        sourceUpdatedAt: '2026-09-01T10:00:00.000Z',
        selectedAt: '2026-09-01T12:00:00.000Z',
        availability: 'deleted',
        freshness: 'changed',
        syncState: 'synced',
        downloadStatus: 'available',
        name: 'deleted-evidence.jpg',
      },
    ],
    isPending: false,
  })),
}));
vi.mock('@/hooks/useAddCaseEvidence', () => ({
  useAddCaseEvidence: vi.fn(() => ({ mutate: addMutate, isPending: false })),
}));
vi.mock('@/hooks/useRemoveCaseEvidence', () => ({
  useRemoveCaseEvidence: vi.fn(() => ({
    mutate: removeMutate,
    isPending: false,
  })),
}));
vi.mock('@/hooks/useSetCaseEvidenceAttachmentSelected', () => ({
  useSetCaseEvidenceAttachmentSelected: vi.fn(() => ({
    mutate: attachmentMutate,
    isPending: false,
  })),
}));
vi.mock('@/components/shared/CaseEvidenceMap', () => ({
  CaseEvidenceMap: () => <div data-testid="case-evidence-map" />,
}));

beforeEach(() => {
  vi.clearAllMocks();
  addMutate.mockReset();
  removeMutate.mockReset();
  attachmentMutate.mockReset();
});

describe('CaseEvidenceWorkspace', () => {
  it('browses observations, alerts, and tracks and adds a track to the Case', async () => {
    const user = userEvent.setup();
    render(
      <CaseEvidenceWorkspace projectLocalId="project-1" caseLocalId="case-1" />,
    );

    expect(screen.getAllByText('Deforestation').length).toBeGreaterThanOrEqual(
      1,
    );
    expect(screen.getByText('Fire alert')).toBeInTheDocument();
    expect(screen.getByText('River patrol')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Add track River patrol' }),
    );
    expect(addMutate).toHaveBeenCalledWith(
      {
        projectLocalId: 'project-1',
        caseLocalId: 'case-1',
        sourceType: 'track',
        sourceLocalId: 'track-1',
      },
      expect.objectContaining({
        onError: expect.any(Function),
        onSuccess: expect.any(Function),
      }),
    );
  });

  it('shows changed and unsynced state and selects attachments independently', async () => {
    const user = userEvent.setup();
    render(
      <CaseEvidenceWorkspace projectLocalId="project-1" caseLocalId="case-1" />,
    );

    expect(
      screen.getAllByText('Changed since added').length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Not project-synced')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Include evidence.jpg' }),
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Include evidence.mp3' }),
    ).not.toBeChecked();
    expect(screen.getByText('Not available locally')).toBeInTheDocument();

    await user.click(
      screen.getByRole('checkbox', { name: 'Include evidence.mp3' }),
    );
    expect(attachmentMutate).toHaveBeenCalledWith(
      {
        projectLocalId: 'project-1',
        caseLocalId: 'case-1',
        evidenceLocalId: 'evidence-obs',
        attachmentLocalId: 'audio-1',
        selected: true,
      },
      expect.objectContaining({
        onError: expect.any(Function),
        onSuccess: expect.any(Function),
      }),
    );
  });

  it('shows last-known local metadata for deleted selected evidence', () => {
    render(
      <CaseEvidenceWorkspace projectLocalId="project-1" caseLocalId="case-1" />,
    );

    expect(screen.getByText('Deleted fire alert')).toBeInTheDocument();
    expect(screen.getByText('Deleted at source')).toBeInTheDocument();
  });

  it('retains selected deleted media with explicit warnings and a deselect path', async () => {
    const user = userEvent.setup();
    render(
      <CaseEvidenceWorkspace projectLocalId="project-1" caseLocalId="case-1" />,
    );

    const deletedMedia = screen.getByRole('checkbox', {
      name: 'Include deleted-evidence.jpg',
    });
    expect(deletedMedia).toBeChecked();
    expect(screen.getByText('Media deleted at source')).toBeInTheDocument();
    expect(
      screen.getByText('Media changed since selected'),
    ).toBeInTheDocument();

    await user.click(deletedMedia);
    expect(attachmentMutate).toHaveBeenCalledWith(
      {
        projectLocalId: 'project-1',
        caseLocalId: 'case-1',
        evidenceLocalId: 'evidence-obs',
        attachmentLocalId: 'photo-deleted',
        selected: false,
      },
      expect.objectContaining({
        onError: expect.any(Function),
        onSuccess: expect.any(Function),
      }),
    );
  });

  it('supports chronological timeline and map views for selected evidence', async () => {
    const user = userEvent.setup();
    render(
      <CaseEvidenceWorkspace projectLocalId="project-1" caseLocalId="case-1" />,
    );

    await user.click(screen.getByRole('button', { name: 'Timeline' }));
    expect(screen.getAllByText('Sep 1, 2026').length).toBeGreaterThanOrEqual(1);
    await user.click(screen.getByRole('button', { name: 'Map' }));
    expect(screen.getByTestId('case-evidence-map')).toBeInTheDocument();
  });

  it('shows an explicit error when an evidence mutation fails', async () => {
    addMutate.mockImplementationOnce(
      (_variables: unknown, options?: { onError?: (error: Error) => void }) => {
        options?.onError?.(new Error('write failed'));
      },
    );
    const user = userEvent.setup();
    render(
      <CaseEvidenceWorkspace projectLocalId="project-1" caseLocalId="case-1" />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Add track River patrol' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not update Case evidence. Try again.',
    );
  });
});
