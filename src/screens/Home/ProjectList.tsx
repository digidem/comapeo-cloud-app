import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface ProjectListProps {
  projects: Array<{ localId: string; name?: string }>;
  selectedProjectId: string | null;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
  isLoading?: boolean;
  hideEmptyState?: boolean;
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
});

function ProjectList({
  projects,
  selectedProjectId,
  onSelect,
  onCreateNew,
  isLoading = false,
  hideEmptyState = false,
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
                <button
                  type="button"
                  onClick={() => onSelect(project.localId)}
                  className={`w-full text-left px-3 py-2 min-h-[44px] rounded-btn text-sm font-medium transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isActive
                      ? 'bg-primary-soft text-primary'
                      : 'text-text hover:bg-surface'
                  }`}
                >
                  {project.name ?? intl.formatMessage(messages.untitledProject)}
                </button>
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
