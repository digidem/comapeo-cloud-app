import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateCaseScreen } from '@/screens/CreateCaseScreen';

const mockMutate = vi.fn();
const mockNavigate = vi.fn();
let mockSelectedProjectId: string | null = 'proj-1';
let mockIsPending = false;
let mockIsError = false;
let mockProjectsIsPending = false;

vi.mock('@/components/layout/shell-slot', () => ({ useShellSlot: vi.fn() }));

vi.mock('@/hooks/useCreateCase', () => ({
  useCreateCase: vi.fn(() => ({
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

// Radix Select uses scrollIntoView internally which jsdom doesn't support
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('CreateCaseScreen', () => {
  beforeEach(() => {
    mockSelectedProjectId = 'proj-1';
    mockIsPending = false;
    mockIsError = false;
    mockProjectsIsPending = false;
    mockMutate.mockReset();
    mockNavigate.mockReset();
  });

  it('renders the create case form with title and primary type fields', () => {
    render(<CreateCaseScreen />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Create Case' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByLabelText('Primary Type')).toBeInTheDocument();
  });

  it('offers the Brazil v1 Case taxonomy from the parent specification', async () => {
    const user = userEvent.setup();
    render(<CreateCaseScreen />);

    await user.click(screen.getByRole('combobox'));

    for (const label of [
      'Invasion / illegal occupation',
      'Territorial encroachment or infrastructure impact',
      'Deforestation / illegal logging',
      'Illegal mining',
      'Fire',
      'Illegal hunting / fishing / wildlife exploitation',
      'Pollution / contamination',
      'Threats / intimidation / violence',
      'Other violation of Indigenous or territorial rights',
      'Other',
    ]) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    }
  });

  it('shows validation error when title is empty on submit', async () => {
    const user = userEvent.setup();
    render(<CreateCaseScreen />);
    await user.click(screen.getByRole('button', { name: 'Create Case' }));
    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('shows validation error when primary type is not selected on submit', async () => {
    const user = userEvent.setup();
    render(<CreateCaseScreen />);
    await user.type(screen.getByLabelText('Title'), 'My New Case');
    await user.click(screen.getByRole('button', { name: 'Create Case' }));
    expect(screen.getByText('Primary type is required')).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('submits with title and primary type and navigates to the created case detail', async () => {
    const user = userEvent.setup();
    mockMutate.mockImplementationOnce((_input, options) => {
      options.onSuccess?.({ localId: 'case-1' });
    });

    render(<CreateCaseScreen />);
    await user.type(screen.getByLabelText('Title'), 'Investigation Alpha');
    // Open the Radix Select and choose an option
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('Illegal mining'));
    await user.click(screen.getByRole('button', { name: 'Create Case' }));

    expect(mockMutate).toHaveBeenCalledWith(
      {
        projectLocalId: 'proj-1',
        title: 'Investigation Alpha',
        caseType: 'illegal_mining',
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/cases/case-1' });
  });

  it('defaults status to draft on creation (no status in payload)', async () => {
    const user = userEvent.setup();
    render(<CreateCaseScreen />);
    await user.type(screen.getByLabelText('Title'), 'Draft Case');
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('Fire'));
    await user.click(screen.getByRole('button', { name: 'Create Case' }));

    const callArgs = mockMutate.mock.calls[0]?.[0];
    expect(callArgs).toMatchObject({
      projectLocalId: 'proj-1',
      title: 'Draft Case',
      caseType: 'fire',
    });
    // No explicit status in payload — createCase defaults to 'draft'
    expect(callArgs).not.toHaveProperty('status');
  });

  it('disables submit when no project is selected', () => {
    mockSelectedProjectId = null;
    render(<CreateCaseScreen />);
    expect(screen.getByRole('button', { name: 'Create Case' })).toBeDisabled();
    expect(screen.getByText('Select a project first')).toBeInTheDocument();
  });

  it('shows error when creation fails', () => {
    mockIsError = true;
    render(<CreateCaseScreen />);
    expect(
      screen.getByText('Could not create the case. Try again.'),
    ).toBeInTheDocument();
  });

  it('shows skeletons while projects load', () => {
    mockProjectsIsPending = true;
    render(<CreateCaseScreen />);
    expect(screen.getAllByTestId('skeleton')).toHaveLength(3);
  });

  it('does not require network — only calls local data-layer function', async () => {
    const user = userEvent.setup();
    mockMutate.mockImplementationOnce((_input, options) => {
      options.onSuccess?.({ localId: 'case-1' });
    });

    render(<CreateCaseScreen />);
    await user.type(screen.getByLabelText('Title'), 'Offline Case');
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('Threats / intimidation / violence'));
    await user.click(screen.getByRole('button', { name: 'Create Case' }));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });
});
