import { defineMessages, useIntl } from 'react-intl';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCountUp } from '@/hooks/useCountUp';
import { ImportDataButton } from '@/screens/Home/ImportDataButton';

interface ProjectBannerCardProps {
  projectName: string;
  description?: string;
  photoUrls?: string[];
  areaSize?: string;
  lastSync?: string | null;
  teamMembersCount?: number;
  onEdit?: () => void;
  onDelete?: () => void;
  projectLocalId?: string;
  onImportComplete?: (result: { imported: number; skipped: number }) => void;
  isLocalProject?: boolean;
  isAreaLoading?: boolean;
}

const messages = defineMessages({
  territoryArea: {
    id: 'dashboard.banner.territoryArea',
    defaultMessage: 'Territory Area',
  },
  lastSync: {
    id: 'dashboard.banner.lastSync',
    defaultMessage: 'Last Sync',
  },
  teamMembers: {
    id: 'dashboard.banner.teamMembers',
    defaultMessage: 'Team Members',
  },
  active: {
    id: 'dashboard.banner.active',
    defaultMessage: 'Active',
  },
  defaultDescription: {
    id: 'dashboard.banner.defaultDescription',
    defaultMessage:
      'A controlled environment for onboarding new rangers and testing field data collection protocols.',
  },
  editProject: {
    id: 'dashboard.banner.editProject',
    defaultMessage: 'Edit Project',
  },
  deleteProject: {
    id: 'dashboard.banner.deleteProject',
    defaultMessage: 'Delete Project',
  },
});

export function ProjectBannerCard({
  projectName,
  description,
  photoUrls,
  areaSize = '0 ha',
  lastSync,
  teamMembersCount = 1,
  onEdit,
  onDelete,
  projectLocalId,
  onImportComplete,
  isLocalProject = false,
  isAreaLoading = false,
}: ProjectBannerCardProps) {
  const intl = useIntl();
  const resolvedDescription =
    description ??
    (projectName
      ? `${projectName} monitoring and data collection project.`
      : intl.formatMessage(messages.defaultDescription));
  const animatedAreaSize = useCountUp(areaSize, 400);

  return (
    <Card className="relative overflow-hidden border-none shadow-card motion-safe:hover:scale-[1.01] motion-safe:hover:shadow-elevated transition-all duration-150">
      {/* Background Image */}
      {photoUrls && photoUrls.length > 0 ? (
        <div
          data-testid="photo-collage"
          className="absolute inset-0 z-0 grid grid-cols-2 grid-rows-2"
        >
          {photoUrls.slice(0, 4).map((url, i) => (
            <div key={i} className="overflow-hidden">
              <img src={url} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
          <div className="absolute inset-0 bg-gradient-to-t from-white via-white/80 to-transparent" />
        </div>
      ) : (
        <div
          data-testid="default-banner-bg"
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: "url('/amazon_banner.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-white via-white/80 to-transparent" />
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 flex flex-col p-6 pt-24 md:p-8 md:pt-32">
        <div className="mb-8 max-w-2xl">
          <h2 className="mb-2 text-2xl font-bold text-text md:text-3xl lg:text-4xl tracking-tight">
            {projectName}
          </h2>
          <p className="text-text-muted md:text-lg max-w-lg">
            {resolvedDescription}
          </p>
        </div>

        {/* Action Bar */}
        {(onEdit || onDelete || isLocalProject) && (
          <div className="flex items-center gap-2 mt-4 mb-4">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1.5 rounded-btn bg-white/80 backdrop-blur-sm border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-white/90 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <svg
                  width="14"
                  height="14"
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
                {intl.formatMessage(messages.editProject)}
              </button>
            )}
            {isLocalProject && projectLocalId && (
              <ImportDataButton
                projectLocalId={projectLocalId}
                projectName={projectName}
                onImportComplete={onImportComplete}
              />
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center gap-1.5 rounded-btn bg-white/80 backdrop-blur-sm border border-error/30 px-3 py-1.5 text-sm font-medium text-error hover:bg-error/10 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-error"
              >
                <svg
                  width="14"
                  height="14"
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
                {intl.formatMessage(messages.deleteProject)}
              </button>
            )}
          </div>
        )}

        {/* Stats Pills */}
        <div className="flex flex-wrap gap-4 mt-auto">
          <div
            data-testid="territory-area-pill"
            className="flex flex-col justify-center rounded-full bg-white/80 backdrop-blur-sm border border-border px-4 py-2 sm:px-6 sm:py-2.5 shadow-pill"
          >
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-0.5">
              {intl.formatMessage(messages.territoryArea)}
            </span>
            {isAreaLoading ? (
              <Skeleton height={24} width={80} />
            ) : (
              <span className="text-lg font-bold text-text">
                {animatedAreaSize}
              </span>
            )}
          </div>

          {lastSync && (
            <div className="flex flex-col justify-center rounded-full bg-white/80 backdrop-blur-sm border border-border px-4 py-2 sm:px-6 sm:py-2.5 shadow-pill">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-0.5">
                {intl.formatMessage(messages.lastSync)}
              </span>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-lg font-bold text-text">{lastSync}</span>
              </div>
            </div>
          )}

          <div className="flex flex-col justify-center rounded-full bg-white/80 backdrop-blur-sm border border-border px-4 py-2 sm:px-6 sm:py-2.5 shadow-pill">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-0.5">
              {intl.formatMessage(messages.teamMembers)}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-bold text-text">
                {teamMembersCount} {intl.formatMessage(messages.active)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
