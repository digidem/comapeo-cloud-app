import { useMemo, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { useShellSlot } from '@/components/layout/shell-slot';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiPresets } from '@/hooks/useApiPresets';
import { normalizeCategories } from '@/hooks/useCategories';
import { useFields } from '@/hooks/useFields';
import { useProjects } from '@/hooks/useProjects';
import { CategoryDetail } from '@/screens/CategoriesEditor/CategoryDetail';
import { CategoryGrid } from '@/screens/CategoriesEditor/CategoryGrid';
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
});

export function CategoriesEditorScreen() {
  const intl = useIntl();
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const baseUrl = useAuthStore((s) => s.baseUrl);
  const projectsQuery = useProjects();

  const projects = projectsQuery.data ?? [];
  const selectedProject = projects.find((p) => p.localId === selectedProjectId);
  // Server expects projectPublicId (base32) — use remoteId which is
  // populated by pullProjects for remote archive projects, and falls
  // back to null (query disabled) for local-only projects.
  const presetsQuery = useApiPresets(selectedProject?.remoteId ?? null);

  const topbarWorkspaceName =
    selectedProject?.name ?? intl.formatMessage(messages.untitledProject);
  const shellSlot = useMemo(
    () => ({
      topbarWorkspaceName: selectedProjectId ? topbarWorkspaceName : undefined,
      topbarModeLabel: intl.formatMessage(messages.title),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedProjectId, topbarWorkspaceName],
  );
  useShellSlot(shellSlot);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );

  const fieldsQuery = useFields(selectedProjectId);

  const fieldLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const field of fieldsQuery.data ?? []) {
      if (field.remoteId) {
        map.set(field.remoteId, field.label);
      }
    }
    return map;
  }, [fieldsQuery.data]);

  const categoryGroups = useMemo(
    () =>
      normalizeCategories(
        presetsQuery.data ?? [],
        intl.locale,
        searchQuery,
        fieldLabels,
      ),
    [presetsQuery.data, intl.locale, searchQuery, fieldLabels],
  );

  const selectedCategory = useMemo(() => {
    if (!selectedCategoryId) return null;
    for (const group of categoryGroups) {
      const found = group.categories.find(
        (c) => c.docId === selectedCategoryId,
      );
      if (found) return found;
    }
    return null;
  }, [selectedCategoryId, categoryGroups]);

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
          className="rounded-button bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark transition-colors"
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

  // No archive server configured — presets query is disabled and isPending
  // would stay true forever. Show an actionable message instead.
  if (baseUrl === null) {
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
          className="rounded-button bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark transition-colors"
        >
          {intl.formatMessage(messages.retry)}
        </button>
      </div>
    );
  }

  const hasPresets = (presetsQuery.data ?? []).length > 0;
  const hasResults = categoryGroups.length > 0;

  return (
    <div className="flex flex-col gap-6 p-3 sm:p-4 lg:p-6">
      <h1 className="text-2xl font-bold text-text">
        {intl.formatMessage(messages.title)}
      </h1>

      <input
        type="text"
        aria-label={intl.formatMessage(messages.search)}
        placeholder={intl.formatMessage(messages.search)}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full rounded-button border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary"
      />

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
          <div className="flex-1 min-w-0">
            <CategoryGrid
              groups={categoryGroups}
              selectedCategoryId={selectedCategoryId}
              onCategorySelect={setSelectedCategoryId}
            />
          </div>
          <aside className="w-full lg:w-80 shrink-0 rounded-card bg-surface-card p-4">
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
              fieldLabels={fieldLabels}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
