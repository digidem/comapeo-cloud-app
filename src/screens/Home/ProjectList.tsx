import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface ProjectListProps {
  projects: Array<{ localId: string; name?: string }>;
  selectedProjectId: string | null;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
  isLoading?: boolean;
}

function ProjectList({
  projects,
  selectedProjectId,
  onSelect,
  onCreateNew,
  isLoading = false,
}: ProjectListProps) {
  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" size="sm" onClick={onCreateNew}>
        + New Project
      </Button>

      {isLoading && (
        <div className="flex flex-col gap-2 mt-2">
          <Skeleton height={36} />
          <Skeleton height={36} />
          <Skeleton height={36} />
        </div>
      )}

      {!isLoading && projects.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-text-muted">No projects yet</p>
          <Button variant="primary" size="sm" onClick={onCreateNew}>
            Create your first project
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
                  className={`w-full text-left px-3 py-2 rounded-[12px] text-sm font-medium transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isActive
                      ? 'bg-[#EAF2FF] text-[#1F6FFF]'
                      : 'text-text hover:bg-surface'
                  }`}
                >
                  {project.name ?? 'Untitled Project'}
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
