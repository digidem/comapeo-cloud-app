import { defineMessages, useIntl } from 'react-intl';

interface ProjectOverviewHeaderProps {
  projectName: string;
  observationCount: number;
  sourceType: 'local' | 'remoteArchive';
  lastSyncedAt?: string | null;
}

const messages = defineMessages({
  observationCount: {
    id: 'home.observations.count',
    defaultMessage:
      '{count, plural, one {# observation} other {# observations}}',
  },
  local: {
    id: 'home.source.local',
    defaultMessage: 'Local',
  },
  archive: {
    id: 'home.source.archive',
    defaultMessage: 'Archive',
  },
  lastSynced: {
    id: 'home.archive.lastSynced',
    defaultMessage: 'Last synced: {date}',
  },
});

export function ProjectOverviewHeader({
  projectName,
  observationCount,
  sourceType,
  lastSyncedAt,
}: ProjectOverviewHeaderProps) {
  const intl = useIntl();
  const observationLabel = intl.formatMessage(messages.observationCount, {
    count: observationCount,
  });

  const showLastSynced =
    sourceType === 'remoteArchive' &&
    lastSyncedAt !== null &&
    lastSyncedAt !== undefined;

  const formattedSyncDate = showLastSynced
    ? new Date(lastSyncedAt!).toLocaleString()
    : null;

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold text-[#172033]">{projectName}</h1>
      <div className="flex items-center gap-3">
        <span className="text-sm text-[#172033]">{observationLabel}</span>
        {sourceType === 'local' ? (
          <span className="rounded-full bg-gray-200 px-3 py-0.5 text-xs font-medium text-gray-700">
            {intl.formatMessage(messages.local)}
          </span>
        ) : (
          <span className="rounded-full bg-blue-100 px-3 py-0.5 text-xs font-medium text-blue-700">
            {intl.formatMessage(messages.archive)}
          </span>
        )}
        {showLastSynced && (
          <span className="text-xs text-gray-500">
            {intl.formatMessage(messages.lastSynced, {
              date: formattedSyncDate,
            })}
          </span>
        )}
      </div>
    </div>
  );
}
