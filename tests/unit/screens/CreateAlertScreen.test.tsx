import { fireEvent, render, screen, userEvent } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateAlertScreen } from '@/screens/CreateAlertScreen';

const mockMutate = vi.fn();
const mockNavigate = vi.fn();

let mockSelectedProjectId: string | null = 'proj-1';
let mockIsPending = false;
let mockProjectsIsPending = false;

vi.mock('@/components/layout/shell-slot', () => ({
  useShellSlot: vi.fn(),
}));

vi.mock('@/hooks/useCreateAlert', () => ({
  useCreateAlert: vi.fn(() => ({
    mutate: mockMutate,
    isPending: mockIsPending,
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
    data: [{ localId: 'proj-1', name: 'Test Project' }],
    isPending: mockProjectsIsPending,
  })),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => mockNavigate,
}));

/** Helper to set textarea value (avoids userEvent's special-char parsing of `{`) */
function setTextareaValue(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
}

describe('CreateAlertScreen', () => {
  beforeEach(() => {
    mockSelectedProjectId = 'proj-1';
    mockIsPending = false;
    mockProjectsIsPending = false;
    mockMutate.mockClear();
    mockNavigate.mockClear();
  });

  it('renders create alert title', () => {
    render(<CreateAlertScreen />);
    expect(screen.getByText('Create Alert')).toBeInTheDocument();
  });

  it('renders geometry textarea', () => {
    render(<CreateAlertScreen />);
    expect(screen.getByText('Geometry (GeoJSON)')).toBeInTheDocument();
  });

  it('renders submit button', () => {
    render(<CreateAlertScreen />);
    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('renders cancel button', () => {
    render(<CreateAlertScreen />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('renders detection date fields', () => {
    render(<CreateAlertScreen />);
    expect(screen.getByText('Detection Date Start')).toBeInTheDocument();
    expect(screen.getByText('Detection Date End')).toBeInTheDocument();
  });

  it('renders skeleton loading while projects are pending', () => {
    mockProjectsIsPending = true;
    render(<CreateAlertScreen />);

    expect(screen.getAllByTestId('skeleton')).toHaveLength(3);
    expect(screen.queryByText('Create Alert')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Geometry (GeoJSON)'),
    ).not.toBeInTheDocument();
  });

  it('shows validation error when geometry is not valid JSON', async () => {
    const user = userEvent.setup();
    render(<CreateAlertScreen />);

    const geometryInput = screen.getByPlaceholderText(
      '{"type":"Point","coordinates":[0,0]}',
    );
    setTextareaValue(geometryInput, 'not json');
    await user.click(screen.getByText('Create'));

    expect(screen.getByText('Invalid GeoJSON geometry')).toBeInTheDocument();
  });

  it('shows validation error when geometry is valid JSON but not valid GeoJSON', async () => {
    const user = userEvent.setup();
    render(<CreateAlertScreen />);

    const geometryInput = screen.getByPlaceholderText(
      '{"type":"Point","coordinates":[0,0]}',
    );
    setTextareaValue(geometryInput, '{"foo":"bar"}');
    await user.click(screen.getByText('Create'));

    expect(screen.getByText('Invalid GeoJSON geometry')).toBeInTheDocument();
  });

  it('shows validation error when metadata is not valid JSON', async () => {
    const user = userEvent.setup();
    render(<CreateAlertScreen />);

    const geometryInput = screen.getByPlaceholderText(
      '{"type":"Point","coordinates":[0,0]}',
    );
    setTextareaValue(geometryInput, '{"type":"Point","coordinates":[0,0]}');

    const metadataInput = screen.getByLabelText('Metadata (JSON, optional)');
    setTextareaValue(metadataInput, 'not json');
    await user.click(screen.getByText('Create'));

    expect(screen.getByText('Invalid JSON')).toBeInTheDocument();
  });

  it('passes validation with valid geometry and empty metadata', async () => {
    const user = userEvent.setup();
    render(<CreateAlertScreen />);

    const geometryInput = screen.getByPlaceholderText(
      '{"type":"Point","coordinates":[0,0]}',
    );
    setTextareaValue(geometryInput, '{"type":"Point","coordinates":[0,0]}');
    await user.click(screen.getByText('Create'));

    expect(mockMutate).toHaveBeenCalled();
  });

  it('submit button is disabled when no project is selected', () => {
    mockSelectedProjectId = null;
    render(<CreateAlertScreen />);

    expect(screen.getByText('Create')).toBeDisabled();
  });

  it('shows "Select a project first" warning when no project selected', () => {
    mockSelectedProjectId = null;
    render(<CreateAlertScreen />);

    expect(screen.getByText('Select a project first')).toBeInTheDocument();
  });

  it('successful form submission calls mutate with correct payload', async () => {
    const user = userEvent.setup();
    render(<CreateAlertScreen />);

    const geometryInput = screen.getByPlaceholderText(
      '{"type":"Point","coordinates":[0,0]}',
    );
    setTextareaValue(geometryInput, '{"type":"Point","coordinates":[10,20]}');

    const metadataInput = screen.getByLabelText('Metadata (JSON, optional)');
    setTextareaValue(metadataInput, '{"severity":"high"}');

    await user.click(screen.getByText('Create'));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectLocalId: 'proj-1',
        geometry: { type: 'Point', coordinates: [10, 20] },
        metadata: { severity: 'high' },
      }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('successful submission navigates back via onSuccess callback', async () => {
    const user = userEvent.setup();
    render(<CreateAlertScreen />);

    const geometryInput = screen.getByPlaceholderText(
      '{"type":"Point","coordinates":[0,0]}',
    );
    mockMutate.mockImplementationOnce(
      (_input: unknown, opts?: { onSuccess?: () => void }) => {
        opts?.onSuccess?.();
      },
    );
    setTextareaValue(geometryInput, '{"type":"Point","coordinates":[0,0]}');
    await user.click(screen.getByText('Create'));

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/data' });
  });

  it('submit button shows loading state when isPending is true', () => {
    mockIsPending = true;
    render(<CreateAlertScreen />);

    expect(screen.getByText('Create')).toBeDisabled();
  });

  it('cancel button navigates back', async () => {
    const user = userEvent.setup();
    render(<CreateAlertScreen />);

    await user.click(screen.getByText('Cancel'));
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/data' });
  });
});
