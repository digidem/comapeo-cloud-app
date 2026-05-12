import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface ProjectListProps {
  projects: Array<{ localId: string; name?: string }>;
  selectedProjectId: string | null;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
  onEdit: (localId: string) => void;
  onDelete: (localId: string) => void;
  isLoading?: boolean;
  hideEmptyState?: boolean;
  archiveId?: string;
}

const messages = defineMessages({
  newProject: {
    id: 'home.newProject',
    defaultMessage: 'New Project',
  },
  newProjectListAria: {
    id: 'home.newProject.listAria',
    defaultMessage: 'Create new project from project list',
  },
  noProjects: {
    id: 'home.noProjects',
    defaultMessage: 'No projects yet',
  },
  firstProject: {
    id: 'home.noProjects.cta',
    defaultMessage: 'Create your first project',
  },
  firstProjectListAria: {
    id: 'home.noProjects.listCtaAria',
    defaultMessage: 'Create your first project from project list',
  },
  untitledProject: {
    id: 'home.untitledProject',
    defaultMessage: 'Untitled Project',
  },
  editAria: {
    id: 'home.project.editAria',
    defaultMessage: 'Edit project',
  },
  deleteAria: {
    id: 'home.project.deleteAria',
    defaultMessage: 'Delete project',
  },
});

function ProjectList({
  projects,
  selectedProjectId,
  onSelect,
  onCreateNew,
  onEdit,
  onDelete,
  isLoading = false,
  hideEmptyState = false,
  archiveId: _archiveId,
}: ProjectListProps) {
  const intl = useIntl();

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={onCreateNew}
        aria-label={intl.formatMessage(messages.newProjectListAria)}
      >
        + {intl.formatMessage(messages.newProject)}
      </Button>

      {isLoading && (
        <div className="flex flex-col gap-2 mt-2">
          <Skeleton height={36} />
          <Skeleton height={36} />
          <Skeleton height={36} />
        </div>
      )}

      {!isLoading && projects.length === 0 && !hideEmptyState && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-text-muted">
            {intl.formatMessage(messages.noProjects)}
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={onCreateNew}
            aria-label={intl.formatMessage(messages.firstProjectListAria)}
          >
            {intl.formatMessage(messages.firstProject)}
          </Button>
        </div>
      )}

      {!isLoading && projects.length > 0 && (
        <ul className="flex flex-col gap-1 mt-1">
          {projects.map((project) => {
            const isActive = project.localId === selectedProjectId;
            return (
              <li key={project.localId}>
                <div
                  className={`flex items-center gap-1 px-3 py-2 min-h-[44px] rounded-btn text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-soft text-primary'
                      : 'text-text hover:bg-surface'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(project.localId)}
                    className="flex-1 text-left cursor-pointer focus:outline-none"
                  >
                    {project.name ??
                      intl.formatMessage(messages.untitledProject)}
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(project.localId)}
                    aria-label={intl.formatMessage(messages.editAria)}
                    className="inline-flex items-center justify-center h-8 w-8 rounded-full text-text-muted hover:text-text hover:bg-surface cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(project.localId)}
                    aria-label={intl.formatMessage(messages.deleteAria)}
                    className="inline-flex items-center justify-center h-8 w-8 rounded-full text-text-muted hover:text-error hover:bg-surface cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export { ProjectList };
export type { ProjectListProps };
