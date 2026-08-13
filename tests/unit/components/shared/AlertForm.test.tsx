import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AlertForm } from '@/components/shared/AlertForm';
import type { AlertGeometry, MetadataRow } from '@/lib/alert-form-utils';

const mockMutate = vi.fn();
let mockIsPending = false;
let mockIsError = false;

vi.mock('@/hooks/useCreateAlert', () => ({
  useCreateAlert: vi.fn(() => ({
    mutate: mockMutate,
    isPending: mockIsPending,
    isError: mockIsError,
  })),
}));

vi.mock('@/components/shared/GeometryPicker', () => ({
  GeometryPicker: ({
    onChange,
    showMap,
    allowedTypes,
    externalPoint,
  }: {
    onChange: (geometry: AlertGeometry) => void;
    showMap?: boolean;
    allowedTypes?: readonly string[];
    externalPoint?: [number, number];
  }) => (
    <div
      data-testid="geometry-picker"
      data-show-map={String(showMap)}
      data-allowed-types={allowedTypes?.join(',')}
      data-external-point={externalPoint?.join(',')}
    >
      <button
        type="button"
        onClick={() => onChange({ type: 'Point', coordinates: [10, 20] })}
      >
        Place test point
      </button>
    </div>
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
          { id: 'c', key: 'alert_type', value: 'generic-value', type: 'text' },
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
  await user.type(screen.getByLabelText('Alert Type'), 'fire');
}

describe('AlertForm', () => {
  beforeEach(() => {
    mockIsPending = false;
    mockIsError = false;
    mockMutate.mockReset();
  });

  it('preserves the canonical create-alert payload semantics', async () => {
    const user = userEvent.setup();
    render(
      <AlertForm
        projectLocalId="proj-1"
        onCancel={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    await user.click(screen.getByText('Place test point'));
    await user.click(screen.getByText('Add test metadata'));
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(mockMutate).toHaveBeenCalledWith(
      {
        projectLocalId: 'proj-1',
        geometry: { type: 'Point', coordinates: [10, 20] },
        metadata: { severity: 'high', confidence: 0.9, alert_type: 'fire' },
        detectionDateStart: '2025-01-01T00:00:00.000Z',
        detectionDateEnd: '2025-01-02T23:59:59.999Z',
        sourceId: 'GLAD-S2',
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('configures the shared geometry picker for an external point-only map', () => {
    render(
      <AlertForm
        projectLocalId="proj-1"
        onCancel={vi.fn()}
        geometryPickerProps={{
          showMap: false,
          allowedTypes: ['Point'],
          externalPoint: [-51.25, -3.75],
        }}
      />,
    );

    expect(screen.getByTestId('geometry-picker')).toHaveAttribute(
      'data-show-map',
      'false',
    );
    expect(screen.getByTestId('geometry-picker')).toHaveAttribute(
      'data-allowed-types',
      'Point',
    );
    expect(screen.getByTestId('geometry-picker')).toHaveAttribute(
      'data-external-point',
      '-51.25,-3.75',
    );
  });

  it('submits an externally selected map point without a second geometry action', async () => {
    const user = userEvent.setup();
    render(
      <AlertForm
        projectLocalId="proj-1"
        onCancel={vi.fn()}
        geometryPickerProps={{
          showMap: false,
          allowedTypes: ['Point'],
          externalPoint: [-51.25, -3.75],
        }}
      />,
    );

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectLocalId: 'proj-1',
        geometry: { type: 'Point', coordinates: [-51.25, -3.75] },
      }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('cancels without creating or persisting partial state', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onGeometryChange = vi.fn();
    render(
      <AlertForm
        projectLocalId="proj-1"
        onCancel={onCancel}
        onGeometryChange={onGeometryChange}
      />,
    );

    await user.click(screen.getByText('Place test point'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockMutate).not.toHaveBeenCalled();
    expect(onGeometryChange).toHaveBeenLastCalledWith(undefined);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('reports successful creation without forcing navigation', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    mockMutate.mockImplementationOnce((_input, options) => options.onSuccess());
    render(
      <AlertForm
        projectLocalId="proj-1"
        onCancel={vi.fn()}
        onSuccess={onSuccess}
      />,
    );

    await user.click(screen.getByText('Place test point'));
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(onSuccess).toHaveBeenCalledOnce();
  });
});
