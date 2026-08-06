import { useMemo, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { useNavigate, useParams } from '@tanstack/react-router';

import { useShellSlot } from '@/components/layout/shell-slot';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiFields } from '@/hooks/useApiFields';
import { useApiPresets } from '@/hooks/useApiPresets';
import { normalizeCategories } from '@/hooks/useCategories';
import { useProjects } from '@/hooks/useProjects';
import { selectLatestCategorySet } from '@/lib/categories/latest-set';
import { buildFieldLookup } from '@/lib/fields/normalize';
import { CategoryDetail } from '@/screens/CategoriesEditor/CategoryDetail';
import { CategoryGrid } from '@/screens/CategoriesEditor/CategoryGrid';
// import { ImportSetDialog } from '@/screens/CategoriesEditor/ImportSetDialog';
import { useAuthStore } from '@/stores/auth-store';
import { useProjectStore } from '@/stores/project-store';

const messages = defineMessages({
  title: {
    id: 'categories.title',
    defaultMessage: 'Categories',
  },
  search: {
    id: 'categories.search',
    defaultMessage: 'Search categories...',
  },
  empty: {
    id: 'categories.empty',
    defaultMessage: 'No categories found',
  },
  error: {
    id: 'categories.error',
    defaultMessage: 'Failed to load categories. Please try again.',
  },
  retry: {
    id: 'categories.retry',
    defaultMessage: 'Retry',
  },
  noResults: {
    id: 'categories.noResults',
    defaultMessage: 'No categories match your search',
  },
  untitledProject: {
    id: 'categories.untitledProject',
    defaultMessage: 'Untitled Project',
  },
  selectProject: {
    id: 'categories.selectProject',
    defaultMessage: 'Select a project to view categories',
  },
  fieldsError: {
    id: 'categories.fieldsError',
    defaultMessage: 'Field labels unavailable',
  },
  fieldsRetry: {
    id: 'categories.fieldsRetry',
    defaultMessage: 'Retry',
  },
  noServer: {
    id: 'categories.noServer',
    defaultMessage: 'Connect to an archive server to view categories',
  },
  showLatest: {
    id: 'categories.showLatest',
    defaultMessage: 'Latest',
  },
  showAll: {
    id: 'categories.showAll',
    defaultMessage: 'All',
  },
  hiddenBanner: {
    id: 'categories.hiddenBanner',
    defaultMessage:
      'Showing the latest category set. {count, plural, one {# older category hidden} other {# older categories hidden}}.',
  },
  importButton: {
    id: 'categories.importButton',
    defaultMessage: 'Import Category Set',
  },
});

export function CategoriesEditorScreen() {
  const intl = useIntl();
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const servers = useAuthStore((s) => s.servers);
  const projectsQuery = useProjects();

  const projects = projectsQuery.data ?? [];
  const selectedProject = projects.find((p) => p.localId === selectedProjectId);
  // Server expects projectPublicId (base32) — use remoteId which is
  // populated by pullProjects for remote archive projects, and falls
  // back to null (query disabled) for local-only projects.
  //
  // Route request through the selected project's owning server config
  // rather than assuming the active server. Falls back to active server
  // when no owning server is resolved (e.g. project has no sourceId).
  const owningServer = selectedProject
    ? (servers.find((s) => s.id === selectedProject.sourceId) ?? null)
    : null;
  const serverConfig = owningServer
    ? { baseUrl: owningServer.baseUrl, token: owningServer.token }
    : null;

  const presetsQuery = useApiPresets(
    selectedProject?.remoteId ?? null,
    serverConfig,
  );

  const fieldsQuery = useApiFields(
    selectedProject?.remoteId ?? null,
    serverConfig,
  );

  // Build field lookup from API fields — used both for search label
  // resolution and for rendering resolved NormalizedField[] in the detail.
  const fieldLookup = useMemo(
    () => buildFieldLookup(fieldsQuery.data ?? []),
    [fieldsQuery.data],
  );

  // Build a docId → label map for search matching in normalizeCategories.
  const fieldLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const [docId, field] of fieldLookup) {
      map.set(docId, field.label);
    }
    return map;
  }, [fieldLookup]);

  const topbarWorkspaceName =
    selectedProject?.name ?? intl.formatMessage(messages.untitledProject);
  const shellSlot = useMemo(
    () => ({
      topbarWorkspaceName: selectedProjectId ? topbarWorkspaceName : undefined,
      topbarModeLabel: intl.formatMessage(messages.title),
    }),
    [selectedProjectId, topbarWorkspaceName, intl],
  );
  useShellSlot(shellSlot);

  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const { categoryId } = useParams({ strict: false }) as {
    categoryId?: string;
  };
  const [showAllSets, setShowAllSets] = useState(false);
  // const [isImportOpen, setIsImportOpen] = useState(false);

  const nonDeletedPresets = useMemo(
    () => (presetsQuery.data ?? []).filter((p) => !p.deleted),
    [presetsQuery.data],
  );

  // Compute the latest cluster once so we derive hasMultipleClusters
  // and visiblePresets from a single sort + cluster pass.
  const latestCluster = useMemo(
    () => selectLatestCategorySet(nonDeletedPresets),
    [nonDeletedPresets],
  );

  const hasMultipleClusters = useMemo(
    () => latestCluster.length < nonDeletedPresets.length,
    [latestCluster, nonDeletedPresets],
  );

  const visiblePresets = useMemo(
    () => (showAllSets ? nonDeletedPresets : latestCluster),
    [nonDeletedPresets, showAllSets, latestCluster],
  );

  const hiddenCount = nonDeletedPresets.length - visiblePresets.length;

  const categories = useMemo(
    () =>
      normalizeCategories(
        visiblePresets,
        intl.locale,
        searchQuery,
        fieldLabels,
      ),
    [visiblePresets, intl.locale, searchQuery, fieldLabels],
  );

  // Search ALL non-deleted presets for detail route resolution — this
  // ensures direct navigation to /categories/<older-category-id> still
  // resolves even when the grid is filtered to the latest cluster.
  const allCategoriesForDetail = useMemo(
    () => normalizeCategories(nonDeletedPresets, intl.locale, '', fieldLabels),
    [nonDeletedPresets, intl.locale, fieldLabels],
  );

  const selectedCategory = useMemo(() => {
    if (!categoryId) return null;
    return allCategoriesForDetail.find((c) => c.docId === categoryId) ?? null;
  }, [categoryId, allCategoriesForDetail]);

  // Resolve NormalizedField[] for the selected category from the field
  // lookup, preserving the order of category.fieldRefs. Unresolved refs
  // are represented as "Field unavailable" placeholders (no raw docIds).
  const resolvedFields = useMemo(() => {
    if (!selectedCategory) return [];
    // While fields are still loading, hold off resolution so we don't
    // flash "Field unavailable" placeholders for refs that will resolve.
    if (fieldsQuery.isPending) return [];
    return selectedCategory.fieldRefs.map((ref) => {
      const field = fieldLookup.get(ref.docId);
      if (field) return field;
      // Unresolved field — show "Field unavailable" instead of raw docId
      return {
        docId: ref.docId,
        tagKey: ref.docId,
        type: 'text' as const,
        label: '',
      };
    });
  }, [selectedCategory, fieldLookup, fieldsQuery.isPending]);

  // No project selected — prompt to select one
  if (!selectedProjectId) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <p className="text-text-muted">
          {intl.formatMessage(messages.selectProject)}
        </p>
      </div>
    );
  }

  // Projects still loading
  if (projectsQuery.isPending) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton height={40} width={200} />
        <Skeleton height={48} width="100%" />
        <Skeleton height={100} className="rounded-card" />
        <Skeleton height={100} className="rounded-card" />
      </div>
    );
  }

  // Projects failed to load
  if (projectsQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <p className="text-error text-sm">
          {intl.formatMessage(messages.error)}
        </p>
        <button
          onClick={() => projectsQuery.refetch()}
          className="rounded-button bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover transition-colors"
        >
          {intl.formatMessage(messages.retry)}
        </button>
      </div>
    );
  }

  // Selected project not found in the loaded list
  if (!selectedProject) {
    return (
      <div className="flex items-center justify-center p-8">
        <span className="text-text-muted text-sm">
          {intl.formatMessage(messages.empty)}
        </span>
      </div>
    );
  }

  // Project selected but no remoteId — presets not available via API.
  // Local-only projects don't have a server projectPublicId.
  if (!selectedProject.remoteId) {
    return (
      <div className="flex items-center justify-center p-8">
        <span className="text-text-muted text-sm">
          {intl.formatMessage(messages.empty)}
        </span>
      </div>
    );
  }

  // Presets query not enabled (no server or missing credentials) —
  // isPending would stay true forever. Show an actionable message.
  if (!presetsQuery.isEnabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <p className="text-text-muted">
          {intl.formatMessage(messages.noServer)}
        </p>
      </div>
    );
  }

  // Loading skeleton
  if (presetsQuery.isPending) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton height={40} width={200} />
        <Skeleton height={48} width="100%" />
        <Skeleton height={100} className="rounded-card" />
        <Skeleton height={100} className="rounded-card" />
      </div>
    );
  }

  // Error state
  if (presetsQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <p className="text-error text-sm">
          {intl.formatMessage(messages.error)}
        </p>
        <button
          onClick={() => presetsQuery.refetch()}
          className="rounded-button bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover transition-colors"
        >
          {intl.formatMessage(messages.retry)}
        </button>
      </div>
    );
  }

  const hasPresets = nonDeletedPresets.length > 0;
  const hasResults = categories.length > 0;

  return (
    <div className="flex flex-col gap-6 p-3 sm:p-4 lg:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-text">
          {intl.formatMessage(messages.title)}
        </h1>
        {/* <button
          type="button"
          onClick={() => setIsImportOpen(true)}
          className="rounded-button bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover transition-colors min-h-[44px]"
        >
          {intl.formatMessage(messages.importButton)}
        </button> */}
      </div>

      <input
        type="text"
        aria-label={intl.formatMessage(messages.search)}
        placeholder={intl.formatMessage(messages.search)}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full rounded-button border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary"
      />

      {hasMultipleClusters && (
        <div className="flex flex-col gap-2">
          {!showAllSets && (
            <p className="text-text-muted text-sm">
              {intl.formatMessage(messages.hiddenBanner, {
                count: hiddenCount,
              })}
            </p>
          )}
          <div className="inline-flex rounded-button border border-border bg-surface-card p-0.5">
            <button
              type="button"
              aria-pressed={!showAllSets}
              onClick={() => setShowAllSets(false)}
              className={`rounded-button px-3 py-1 text-xs font-medium transition-colors ${
                !showAllSets
                  ? 'bg-primary text-white'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              {intl.formatMessage(messages.showLatest)}
            </button>
            <button
              type="button"
              aria-pressed={showAllSets}
              onClick={() => setShowAllSets(true)}
              className={`rounded-button px-3 py-1 text-xs font-medium transition-colors ${
                showAllSets
                  ? 'bg-primary text-white'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              {intl.formatMessage(messages.showAll)}
            </button>
          </div>
        </div>
      )}

      {!hasPresets && (
        <div className="flex items-center justify-center p-8">
          <span className="text-text-muted text-sm">
            {intl.formatMessage(messages.empty)}
          </span>
        </div>
      )}

      {hasPresets && !hasResults && (
        <div className="flex flex-col items-center justify-center gap-3 p-8">
          <span className="text-text-muted text-sm">
            {intl.formatMessage(messages.noResults)}
          </span>
          {fieldsQuery.isError && (
            <button
              onClick={() => fieldsQuery.refetch()}
              className="rounded-button bg-warning px-3 py-1 text-xs font-medium text-white hover:opacity-80 transition-opacity"
            >
              {intl.formatMessage(messages.fieldsRetry)}
            </button>
          )}
        </div>
      )}

      {hasPresets && hasResults && (
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Grid — hidden on mobile when a category is selected (detail
              takes over the viewport, matching mobile navigation pattern). */}
          <div
            className={`flex-1 min-w-0 ${categoryId ? 'hidden lg:block' : ''}`}
          >
            <CategoryGrid
              categories={categories}
              selectedCategoryId={categoryId}
              onCategorySelect={(docId) =>
                navigate({
                  to: '/categories/$categoryId',
                  params: { categoryId: docId },
                })
              }
              projectRemoteId={selectedProject?.remoteId ?? null}
              serverBaseUrl={serverConfig?.baseUrl ?? null}
            />
          </div>
          {/* Detail — shown on mobile only when a category is selected;
              always visible on desktop alongside the grid. */}
          <aside
            className={`w-full lg:w-80 shrink-0 rounded-card bg-surface-card p-4 ${
              !categoryId ? 'hidden lg:block' : ''
            }`}
          >
            {fieldsQuery.isError && (
              <div className="mb-4 flex items-center justify-between rounded-button border border-warning bg-warning-light px-3 py-2 text-sm text-warning-text">
                <span>{intl.formatMessage(messages.fieldsError)}</span>
                <button
                  onClick={() => fieldsQuery.refetch()}
                  className="rounded-button bg-warning px-3 py-1 text-xs font-medium text-white hover:opacity-80 transition-opacity"
                >
                  {intl.formatMessage(messages.fieldsRetry)}
                </button>
              </div>
            )}
            <CategoryDetail
              category={selectedCategory}
              fields={resolvedFields}
              onBack={() => navigate({ to: '/categories' })}
              projectRemoteId={selectedProject?.remoteId ?? null}
              serverBaseUrl={serverConfig?.baseUrl ?? null}
            />
          </aside>
        </div>
      )}

      {/* <ImportSetDialog
        open={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      /> */}
    </div>
  );
}
