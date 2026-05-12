import { defineMessages, useIntl } from 'react-intl';

import { Card } from '@/components/ui/card';

interface ProjectBannerCardProps {
  projectName: string;
  description?: string;
  areaSize?: string;
  lastSync?: string | null;
  teamMembersCount?: number;
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
});

export function ProjectBannerCard({
  projectName,
  description,
  areaSize = '0 ha',
  lastSync,
  teamMembersCount = 1,
}: ProjectBannerCardProps) {
  const intl = useIntl();
  const resolvedDescription =
    description ?? intl.formatMessage(messages.defaultDescription);

  return (
    <Card className="relative overflow-hidden border-none shadow-card motion-safe:hover:scale-[1.01] motion-safe:hover:shadow-elevated transition-all duration-150">
      {/* Background Image */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: "url('/amazon_banner.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/80 to-transparent" />
      </div>

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

        {/* Stats Pills */}
        <div className="flex flex-wrap gap-4 mt-auto">
          <div className="flex flex-col justify-center rounded-full bg-white/80 backdrop-blur-sm border border-border px-4 py-2 sm:px-6 sm:py-2.5 shadow-pill">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-0.5">
              {intl.formatMessage(messages.territoryArea)}
            </span>
            <span className="text-lg font-bold text-text">{areaSize}</span>
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
