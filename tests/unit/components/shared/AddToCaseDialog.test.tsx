import userEvent from '@testing-library/user-event';
import { render, screen } from '@tests/mocks/test-utils';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AddToCaseDialog } from '@/components/shared/AddToCaseDialog';
import { useCases } from '@/hooks/useCases';

const addMutateAsync = vi.fn();
const createMutateAsync = vi.fn();

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

vi.mock('@/hooks/useCases', () => ({
  useCases: vi.fn(() => ({
    data: [
      {
        localId: 'case-1',
        projectLocalId: 'project-1',
        title: 'Existing case',
        caseType: 'fire',
        status: 'draft',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        revision: 1,
        createdBy: 'local',
        deleted: false,
      },
    ],
    isPending: false,
    isError: false,
  })),
}));

vi.mock('@/hooks/useAddCaseEvidence', () => ({
  useAddCaseEvidence: vi.fn(() => ({
    mutateAsync: addMutateAsync,
    isPending: false,
  })),
}));

vi.mock('@/hooks/useCreateCase', () => ({
  useCreateCase: vi.fn(() => ({
    mutateAsync: createMutateAsync,
    isPending: false,
  })),
}));

describe('AddToCaseDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCases).mockReturnValue({
      data: [
        {
          localId: 'case-1',
          projectLocalId: 'project-1',
          title: 'Existing case',
          caseType: 'fire',
          status: 'draft',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
          revision: 1,
          createdBy: 'local',
          deleted: false,
        },
      ],
      isPending: false,
      isError: false,
    } as ReturnType<typeof useCases>);
    addMutateAsync.mockResolvedValue({ localId: 'evidence-1' });
    createMutateAsync.mockResolvedValue({ localId: 'case-new' });
  });

  it('adds every selected source to an existing Case and closes', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <AddToCaseDialog
        open
        onOpenChange={onOpenChange}
        projectLocalId="project-1"
        sources={[
          { sourceType: 'observation', sourceLocalId: 'obs-1' },
          { sourceType: 'observation', sourceLocalId: 'obs-2' },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Existing case/ }));

    expect(addMutateAsync).toHaveBeenCalledTimes(2);
    expect(addMutateAsync).toHaveBeenNthCalledWith(1, {
      projectLocalId: 'project-1',
      caseLocalId: 'case-1',
      sourceType: 'observation',
      sourceLocalId: 'obs-1',
    });
    expect(addMutateAsync).toHaveBeenNthCalledWith(2, {
      projectLocalId: 'project-1',
      caseLocalId: 'case-1',
      sourceType: 'observation',
      sourceLocalId: 'obs-2',
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows a load error instead of an empty state when cases fail to load', async () => {
    vi.mocked(useCases).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    } as ReturnType<typeof useCases>);

    render(
      <AddToCaseDialog
        open
        onOpenChange={vi.fn()}
        projectLocalId="project-1"
        sources={[{ sourceType: 'alert', sourceLocalId: 'alert-1' }]}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load cases. Try again.',
    );
    expect(screen.queryByText('No cases yet for this project.')).toBeNull();
  });

  it('can create the minimal new Case then attach the selected evidence', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <AddToCaseDialog
        open
        onOpenChange={onOpenChange}
        projectLocalId="project-1"
        sources={[{ sourceType: 'alert', sourceLocalId: 'alert-1' }]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'New case' }));
    await user.type(screen.getByLabelText('Title'), 'Incident report');
    await user.click(screen.getByRole('combobox', { name: /Primary type/i }));
    await user.click(screen.getByRole('option', { name: 'Fire' }));
    await user.click(screen.getByRole('button', { name: 'Create and add' }));

    expect(createMutateAsync).toHaveBeenCalledWith({
      projectLocalId: 'project-1',
      title: 'Incident report',
      caseType: 'fire',
    });
    expect(addMutateAsync).toHaveBeenCalledWith({
      projectLocalId: 'project-1',
      caseLocalId: 'case-new',
      sourceType: 'alert',
      sourceLocalId: 'alert-1',
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
