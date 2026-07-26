import realArchiveResponse from '@tests/fixtures/fields/real-archive-response.json';
import { server } from '@tests/mocks/node';
import { render, screen } from '@tests/mocks/test-utils';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CategoriesEditorScreen } from '@/screens/CategoriesEditor';

/**
 * Proof test for the "Field labels unavailable" bug: exercises the REAL
 * pipeline (apiClient.getFields -> fieldsResponseSchema -> normalizeApiField
 * -> buildFieldLookup -> CategoryDetail render) against the real archive
 * server /field response shape (tagKey, camelCase selectOne/selectMultiple).
 * Only useApiFields/useApiPresets' network layer (MSW) and unrelated
 * app-level stores/routing are mocked — the schema parsing and field
 * normalization run for real.
 */

const mockRoutePreset = {
  docId: 'preset-real',
  versionId: 'preset-real/0',
  originalVersionId: 'preset-real/0',
  schemaName: 'preset' as const,
  createdAt: '2024-03-15T10:00:00Z',
  updatedAt: '2024-03-15T10:00:00Z',
  links: [],
  deleted: false,
  name: 'Risco',
  geometry: ['point'] as const,
  tags: { category: 'risk' },
  addTags: {},
  removeTags: {},
  fieldRefs: [
    { docId: 'field-text' },
    { docId: 'field-select-one' },
    { docId: 'field-select-multiple' },
  ],
  color: '#FF5733',
  terms: [],
};

let mockRouteParams: { categoryId?: string } = {
  categoryId: 'preset-real',
};

vi.mock('@/components/layout/shell-slot', () => ({
  useShellSlot: vi.fn(),
}));

vi.mock('@/stores/project-store', () => ({
  useProjectStore: vi.fn(
    (selector: (s: { selectedProjectId: string | null }) => string | null) =>
      selector({ selectedProjectId: 'proj-1' }),
  ),
}));

vi.mock('@/hooks/useProjects', () => ({
  useProjects: vi.fn(() => ({
    data: [
      {
        localId: 'proj-1',
        name: 'Test Project',
        sourceId: 'server-1',
        remoteId: 'base32proj1',
      },
    ],
    isPending: false,
  })),
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn(
    (
      selector: (s: {
        baseUrl: string | null;
        token: string | null;
        servers: Array<{ id: string; baseUrl: string; token: string }>;
      }) => unknown,
    ) =>
      selector({
        baseUrl: 'https://archive.example.com',
        token: 'test-token',
        servers: [],
      }),
  ),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
  useParams: () => mockRouteParams,
  useSearch: () => ({}),
}));

describe('CategoriesEditorScreen — real archive server field resolution', () => {
  beforeEach(() => {
    mockRouteParams = { categoryId: 'preset-real' };

    server.use(
      http.get('*/projects/*/preset', () => {
        return HttpResponse.json({ data: [mockRoutePreset] });
      }),
      http.get('*/projects/*/field', () => {
        return HttpResponse.json(realArchiveResponse);
      }),
    );
  });

  it('renders real field labels instead of "Field labels unavailable"', async () => {
    render(<CategoriesEditorScreen />);

    expect(await screen.findByText('Espécie')).toBeInTheDocument();
    expect(
      await screen.findByText('Autoridade comunicada'),
    ).toBeInTheDocument();
    expect(await screen.findByText('Causa do risco')).toBeInTheDocument();

    expect(
      screen.queryByText('Field labels unavailable'),
    ).not.toBeInTheDocument();
  });

  it('does not show the fields error banner', async () => {
    render(<CategoriesEditorScreen />);

    // 'Risco' appears in both the selected category card and the detail
    // header — assert presence via the detail <h2> (heading role).
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Risco' }),
    ).toBeInTheDocument();

    expect(
      screen.queryByText('Field labels unavailable'),
    ).not.toBeInTheDocument();
  });

  it('excludes deleted fields referenced by a preset', async () => {
    // Reference the deleted fixture field (docId 'field-deleted-text',
    // label 'Name', deleted:true) so buildFieldLookup receives a deleted
    // entry. The Categories editor must NOT surface it as a usable field.
    const presetWithDeleted = {
      ...mockRoutePreset,
      fieldRefs: [{ docId: 'field-text' }, { docId: 'field-deleted-text' }],
    };
    server.use(
      http.get('*/projects/*/preset', () =>
        HttpResponse.json({ data: [presetWithDeleted] }),
      ),
    );

    render(<CategoriesEditorScreen />);

    // The non-deleted field still resolves.
    expect(await screen.findByText('Espécie')).toBeInTheDocument();
    // The deleted field's label must NOT appear as a usable field.
    expect(screen.queryByText('Name')).not.toBeInTheDocument();
    // And the editor must not fall back to the error banner.
    expect(
      screen.queryByText('Field labels unavailable'),
    ).not.toBeInTheDocument();
  });
});
