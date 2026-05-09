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
});

export function ProjectBannerCard({
  projectName,
  description = 'A controlled environment for onboarding new rangers and testing field data collection protocols.',
  areaSize = '0 ha',
  lastSync,
  teamMembersCount = 1,
}: ProjectBannerCardProps) {
  const intl = useIntl();

  return (
    <Card className="relative overflow-hidden border-none shadow-md">
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
          <h2 className="mb-2 text-3xl font-bold text-gray-900 md:text-4xl tracking-tight">
            {projectName}
          </h2>
          <p className="text-gray-700 md:text-lg max-w-lg">{description}</p>
        </div>

        {/* Stats Pills */}
        <div className="flex flex-wrap gap-4 mt-auto">
          <div className="flex flex-col justify-center rounded-full bg-white/80 backdrop-blur-sm border border-gray-200 px-6 py-2.5 shadow-sm">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">
              {intl.formatMessage(messages.territoryArea)}
            </span>
            <span className="text-lg font-bold text-gray-900">{areaSize}</span>
          </div>

          {lastSync && (
            <div className="flex flex-col justify-center rounded-full bg-white/80 backdrop-blur-sm border border-gray-200 px-6 py-2.5 shadow-sm">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">
                {intl.formatMessage(messages.lastSync)}
              </span>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <span className="text-lg font-bold text-gray-900">
                  {lastSync}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-col justify-center rounded-full bg-white/80 backdrop-blur-sm border border-gray-200 px-6 py-2.5 shadow-sm">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">
              {intl.formatMessage(messages.teamMembers)}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-bold text-gray-900">
                {teamMembersCount} {intl.formatMessage(messages.active)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
