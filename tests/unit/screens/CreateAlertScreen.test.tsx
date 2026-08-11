import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AlertGeometry, MetadataRow } from '@/lib/alert-form-utils';
import { CreateAlertScreen } from '@/screens/CreateAlertScreen';

const mockMutate = vi.fn();
const mockNavigate = vi.fn();
let mockSelectedProjectId: string | null = 'proj-1';
let mockIsPending = false;
let mockIsError = false;
let mockProjectsIsPending = false;

vi.mock('@/components/layout/shell-slot', () => ({ useShellSlot: vi.fn() }));
vi.mock('@/hooks/useCreateAlert', () => ({
  useCreateAlert: vi.fn(() => ({
    mutate: mockMutate,
    isPending: mockIsPending,
    isError: mockIsError,
  })),
}));
vi.mock('@/stores/project-store', () => ({
  useProjectStore: vi.fn(
    (selector: (s: { selectedProjectId: string | null }) => string | null) =>
      selector({ selectedProjectId: mockSelectedProjectId }),
  ),
}));
vi.mock('@/hooks/useProjects', () => ({
  useProjects: vi.fn(() => ({
    data: [
      { localId: 'proj-1', name: 'Test Project' },
      { localId: 'proj-2', name: 'Second Project' },
    ],
    isPending: mockProjectsIsPending,
  })),
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));
vi.mock('@/components/shared/GeometryPicker', () => ({
  GeometryPicker: ({
    onChange,
  }: {
    onChange: (geometry: AlertGeometry) => void;
  }) => (
    <button
      type="button"
      onClick={() => onChange({ type: 'Point', coordinates: [10, 20] })}
    >
      Place test point
    </button>
  ),
}));
vi.mock('@/components/shared/MetadataFields', () => ({
  MetadataFields: ({
    onChange,
  }: {
    onChange: (rows: MetadataRow[]) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange([
          { id: 'a', key: 'severity', value: 'high', type: 'text' },
          { id: 'b', key: 'confidence', value: '0.9', type: 'number' },
        ])
      }
    >
      Add test metadata
    </button>
  ),
}));

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Detection Date Start'), '2025-01-01');
  await user.type(screen.getByLabelText('Detection Date End'), '2025-01-02');
  await user.type(screen.getByLabelText('Source ID'), 'GLAD-S2');
}

describe('CreateAlertScreen', () => {
  beforeEach(() => {
    mockSelectedProjectId = 'proj-1';
    mockIsPending = false;
    mockIsError = false;
    mockProjectsIsPending = false;
    mockMutate.mockReset();
    mockNavigate.mockReset();
  });

  it('renders the map-based alert form without raw JSON fields', () => {
    render(<CreateAlertScreen />);
    expect(screen.getByText('Create Alert')).toBeInTheDocument();
    expect(screen.getByText('Location and shape')).toBeInTheDocument();
    expect(screen.getByLabelText('Source ID')).toBeInTheDocument();
    expect(screen.queryByText(/GeoJSON/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Metadata \(JSON/i)).not.toBeInTheDocument();
  });

  it('requires geometry before submitting', async () => {
    const user = userEvent.setup();
    render(<CreateAlertScreen />);
    await fillRequiredFields(user);
    await user.click(screen.getByText('Create'));
    expect(
      screen.getByText('Choose a valid alert location or shape.'),
    ).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('submits the preserved payload shape with typed metadata and sourceId', async () => {
    const user = userEvent.setup();
    render(<CreateAlertScreen />);
    await user.click(screen.getByText('Place test point'));
    await user.click(screen.getByText('Add test metadata'));
    await fillRequiredFields(user);
    await user.click(screen.getByText('Create'));

    expect(mockMutate).toHaveBeenCalledWith(
      {
        projectLocalId: 'proj-1',
        geometry: { type: 'Point', coordinates: [10, 20] },
        metadata: { severity: 'high', confidence: 0.9 },
        detectionDateStart: '2025-01-01T00:00:00.000Z',
        detectionDateEnd: '2025-01-02T23:59:59.999Z',
        sourceId: 'GLAD-S2',
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('does not reuse geometry after switching projects', async () => {
    const user = userEvent.setup();
    const view = render(<CreateAlertScreen />);
    await user.click(screen.getByText('Place test point'));
    await fillRequiredFields(user);

    mockSelectedProjectId = 'proj-2';
    view.rerender(<CreateAlertScreen />);
    await user.click(screen.getByText('Create'));

    expect(
      screen.getByText('Choose a valid alert location or shape.'),
    ).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('shows a visible error when alert creation fails', () => {
    mockIsError = true;
    render(<CreateAlertScreen />);
    expect(
      screen.getByText('Could not create the alert. Try again.'),
    ).toBeInTheDocument();
  });

  it('navigates to alerts after successful creation', async () => {
    const user = userEvent.setup();
    mockMutate.mockImplementationOnce((_input, options) => options.onSuccess());
    render(<CreateAlertScreen />);
    await user.click(screen.getByText('Place test point'));
    await fillRequiredFields(user);
    await user.click(screen.getByText('Create'));
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/alerts' });
  });

  it('disables submit when no project is selected', () => {
    mockSelectedProjectId = null;
    render(<CreateAlertScreen />);
    expect(screen.getByText('Create')).toBeDisabled();
    expect(screen.getByText('Select a project first')).toBeInTheDocument();
  });

  it('shows skeletons while projects load', () => {
    mockProjectsIsPending = true;
    render(<CreateAlertScreen />);
    expect(screen.getAllByTestId('skeleton')).toHaveLength(3);
  });
});
