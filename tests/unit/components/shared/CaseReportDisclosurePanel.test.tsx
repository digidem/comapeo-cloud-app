import userEvent from '@testing-library/user-event';
import { render, screen } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CaseReportDisclosurePanel } from '@/components/shared/CaseReportDisclosurePanel';

const mutate = vi.fn();

vi.mock('@/hooks/useCaseReportDisclosure', () => ({
  useCaseReportDisclosure: vi.fn(() => ({
    data: {
      projectLocalId: 'project-1',
      caseLocalId: 'case-1',
      agency: 'FUNAI',
      reporterIdentity: 'omit',
      locationMode: 'omit',
      people: [],
      media: [],
      sensitiveFields: [],
      revision: 0,
    },
    isPending: false,
    isError: false,
  })),
}));

vi.mock('@/hooks/useUpsertCaseReportDisclosure', () => ({
  useUpsertCaseReportDisclosure: vi.fn(() => ({
    mutate,
    isPending: false,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mutate.mockReset();
});

describe('CaseReportDisclosurePanel', () => {
  it('starts fail-closed and saves independent people/media/sensitive decisions', async () => {
    const user = userEvent.setup();
    render(
      <CaseReportDisclosurePanel
        projectLocalId="project-1"
        caseLocalId="case-1"
        agency="FUNAI"
        people={[{ id: 'person-1', label: 'Witness A' }]}
        media={[{ id: 'media-1', label: 'evidence.jpg' }]}
        sensitiveFields={[{ id: 'field-1', label: 'Vehicle plate' }]}
      />,
    );

    expect(
      screen.getByRole('radio', { name: 'Omit reporter identity' }),
    ).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Omit location' })).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Include Witness A' }),
    ).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Include evidence.jpg' }),
    ).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Include Vehicle plate' }),
    ).not.toBeChecked();

    await user.click(
      screen.getByRole('radio', { name: 'Include reporter identity' }),
    );
    await user.click(screen.getByRole('radio', { name: 'Area only' }));
    await user.click(
      screen.getByRole('checkbox', { name: 'Include Witness A' }),
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'Include evidence.jpg' }),
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'Include Vehicle plate' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Save disclosure for FUNAI' }),
    );

    expect(mutate).toHaveBeenCalledWith(
      {
        projectLocalId: 'project-1',
        caseLocalId: 'case-1',
        agency: 'FUNAI',
        disclosure: {
          reporterIdentity: 'include',
          locationMode: 'area',
          people: [{ id: 'person-1', include: true }],
          media: [{ id: 'media-1', include: true }],
          sensitiveFields: [{ id: 'field-1', include: true }],
        },
      },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('preserves persisted decisions that are not currently rendered as candidates', async () => {
    const { useCaseReportDisclosure } =
      await import('@/hooks/useCaseReportDisclosure');
    vi.mocked(useCaseReportDisclosure).mockReturnValueOnce({
      data: {
        projectLocalId: 'project-1',
        caseLocalId: 'case-1',
        agency: 'FUNAI',
        reporterIdentity: 'omit',
        locationMode: 'omit',
        people: [{ id: 'person-existing', include: true }],
        media: [],
        sensitiveFields: [{ id: 'field-existing', include: true }],
        revision: 3,
      },
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCaseReportDisclosure>);
    const user = userEvent.setup();

    render(
      <CaseReportDisclosurePanel
        projectLocalId="project-1"
        caseLocalId="case-1"
        agency="FUNAI"
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Save disclosure for FUNAI' }),
    );

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        disclosure: expect.objectContaining({
          people: [{ id: 'person-existing', include: true }],
          sensitiveFields: [{ id: 'field-existing', include: true }],
        }),
      }),
      expect.any(Object),
    );
  });

  it('shows an explicit error when disclosure persistence fails', async () => {
    mutate.mockImplementationOnce(
      (_variables: unknown, options?: { onError?: (error: Error) => void }) => {
        options?.onError?.(new Error('write failed'));
      },
    );
    const user = userEvent.setup();

    render(
      <CaseReportDisclosurePanel
        projectLocalId="project-1"
        caseLocalId="case-1"
        agency="FUNAI"
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Save disclosure for FUNAI' }),
    );

    expect(
      screen.getByRole('alert', {
        name: '',
      }),
    ).toHaveTextContent('Could not save disclosure settings. Try again.');
  });
});
