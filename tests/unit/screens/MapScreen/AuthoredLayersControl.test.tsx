import { fireEvent, render, screen } from '@testing-library/react';
import { AUTHORED_VECTOR_LAYER_FIXTURE } from '@tests/fixtures/authored-layers';
import { describe, expect, it, vi } from 'vitest';

import { IntlProvider } from 'react-intl';

import type { AuthoredLayerDraftEntry } from '@/lib/schemas/saved-map';
import { AuthoredLayersControl } from '@/screens/MapScreen/AuthoredLayersControl';

function renderControl(
  entries: AuthoredLayerDraftEntry[],
  draftIssues = new Map(),
) {
  const props = {
    entries,
    draftIssues,
    onFilesSelected: vi.fn(),
    onToggle: vi.fn(),
    onRemove: vi.fn(),
    onMove: vi.fn(),
  };
  render(
    <IntlProvider locale="en">
      <AuthoredLayersControl {...props} />
    </IntlProvider>,
  );
  return props;
}

describe('AuthoredLayersControl', () => {
  it('renders valid authored layers with visibility, reorder, and remove controls', () => {
    const entry: AuthoredLayerDraftEntry = {
      kind: 'valid',
      key: `layer:${AUTHORED_VECTOR_LAYER_FIXTURE.id}`,
      layer: structuredClone(AUTHORED_VECTOR_LAYER_FIXTURE),
    };
    const second: AuthoredLayerDraftEntry = {
      kind: 'valid',
      key: 'layer:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      layer: {
        ...structuredClone(AUTHORED_VECTOR_LAYER_FIXTURE),
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        name: 'Second layer',
      },
    };
    const props = renderControl([entry, second]);

    expect(screen.getByText('Territory boundary')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /show territory boundary/i }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /move territory boundary down/i }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /remove territory boundary/i }),
    );

    expect(props.onToggle).toHaveBeenCalledWith(entry.key);
    expect(props.onMove).toHaveBeenCalledWith(entry.key, 1);
    expect(props.onRemove).toHaveBeenCalledWith(entry.key);
  });

  it('retains invalid recovery entries in place with removal guidance', () => {
    const invalid: AuthoredLayerDraftEntry = {
      kind: 'invalid',
      key: 'invalid:2',
      originalIndex: 2,
      raw: { schemaVersion: 99, id: 'future-layer' },
      error: {
        code: 'AUTHORED_LAYER_INVALID',
        issues: [
          {
            code: 'schema-version',
            path: ['schemaVersion'],
            message: 'Unsupported authored layer version',
          },
        ],
      },
    };
    const props = renderControl([invalid]);

    expect(screen.getByText('Invalid layer')).toBeInTheDocument();
    expect(
      screen.getByText(
        /remove this invalid layer before saving or downloading/i,
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /remove invalid layer/i }),
    );
    expect(props.onRemove).toHaveBeenCalledWith('invalid:2');
  });

  it('shows a safe own invalid-layer name without invoking accessors', () => {
    const getter = vi.fn(() => 'should not execute');
    const rawWithGetter = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(rawWithGetter, 'name', {
      enumerable: true,
      get: getter,
    });
    const baseInvalid: AuthoredLayerDraftEntry = {
      kind: 'invalid',
      key: 'invalid:0',
      originalIndex: 0,
      raw: { name: 'Future habitat layer', schemaVersion: 99 },
      error: {
        code: 'AUTHORED_LAYER_INVALID',
        issues: [
          {
            code: 'schema-version',
            path: ['schemaVersion'],
            message: 'future',
          },
        ],
      },
    };
    const accessorInvalid: AuthoredLayerDraftEntry = {
      ...baseInvalid,
      key: 'invalid:1',
      originalIndex: 1,
      raw: rawWithGetter,
    };
    const controlInvalid: AuthoredLayerDraftEntry = {
      ...baseInvalid,
      key: 'invalid:2',
      originalIndex: 2,
      raw: { name: 'Unsafe\u0007name', schemaVersion: 99 },
    };

    renderControl([baseInvalid, accessorInvalid, controlInvalid]);

    expect(screen.getByText('Future habitat layer')).toBeInTheDocument();
    expect(screen.getAllByText('Invalid layer')).toHaveLength(2);
    expect(getter).not.toHaveBeenCalled();
  });

  it('shows contextual validation errors inline on the affected valid layer row', () => {
    const entry: AuthoredLayerDraftEntry = {
      kind: 'valid',
      key: `layer:${AUTHORED_VECTOR_LAYER_FIXTURE.id}`,
      layer: structuredClone(AUTHORED_VECTOR_LAYER_FIXTURE),
    };
    const draftIssues = new Map([
      [
        entry.key,
        {
          code: 'AUTHORED_LAYER_INVALID' as const,
          issues: [
            {
              code: 'EMPTY_RASTER_EFFECTIVE_ZOOM_RANGE',
              path: ['source'],
              message: 'This layer has no zoom levels within the map range.',
            },
          ],
        },
      ],
    ]);

    renderControl([entry], draftIssues);

    expect(
      screen.getByText(
        'This raster layer has no usable zoom levels inside the current map zoom range.',
      ),
    ).toBeInTheDocument();
  });

  it('forwards selected GeoJSON files without converting them itself', () => {
    const props = renderControl([]);
    const file = new File(['{}'], 'layer.geojson', {
      type: 'application/geo+json',
    });
    const input = screen.getByLabelText('Add GeoJSON layer');
    fireEvent.change(input, { target: { files: [file] } });
    expect(props.onFilesSelected).toHaveBeenCalledWith([file]);
  });
});
