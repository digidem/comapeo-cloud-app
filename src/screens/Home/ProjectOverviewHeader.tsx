interface ProjectOverviewHeaderProps {
  projectName: string;
  observationCount: number;
  sourceType: 'local' | 'remoteArchive';
  lastSyncedAt?: string | null;
}

export function ProjectOverviewHeader({
  projectName,
  observationCount,
  sourceType,
  lastSyncedAt,
}: ProjectOverviewHeaderProps) {
  const observationLabel =
    observationCount === 1
      ? `${observationCount} observation`
      : `${observationCount} observations`;

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
            Local
          </span>
        ) : (
          <span className="rounded-full bg-blue-100 px-3 py-0.5 text-xs font-medium text-blue-700">
            Archive
          </span>
        )}
        {showLastSynced && (
          <span className="text-xs text-gray-500">
            Last synced: {formattedSyncDate}
          </span>
        )}
      </div>
    </div>
  );
}
