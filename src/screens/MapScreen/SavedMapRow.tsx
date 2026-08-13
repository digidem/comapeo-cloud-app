import { useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import type { SavedMap } from '@/lib/db';

import type { SavedMapsScope } from './SavedMapsScopeToggle';
import { mapMessages } from './messages';

const STATUS_MESSAGE_BY_STATUS: Record<
  SavedMap['status'],
  keyof typeof mapMessages
> = {
  draft: 'statusDraft',
  downloading: 'statusDownloading',
  ready: 'statusReady',
  error: 'statusError',
};

type PendingActionType = 'active' | 'rename' | 'delete';

interface SavedMapRowProps {
  map: SavedMap;
  scope: SavedMapsScope;
  originProjectName?: string;
  isActive: boolean;
  pendingActionType: PendingActionType | null;
  hasPendingAction: boolean;
  onActiveToggle: () => void;
  onPreview: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function SavedMapRow({
  map,
  scope,
  originProjectName,
  isActive,
  pendingActionType,
  hasPendingAction,
  onActiveToggle,
  onPreview,
  onRename,
  onDelete,
}: SavedMapRowProps) {
  const intl = useIntl();
  const isActivePending = pendingActionType === 'active';
  const isRenamePending = pendingActionType === 'rename';
  const isDeletePending = pendingActionType === 'delete';

  return (
    <article
      data-testid="saved-map-row"
      className="rounded-card bg-surface p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-text">
            {map.name}
          </h3>
          {scope === 'all' ? (
            <p className="mt-1 text-xs text-text-muted">
              {originProjectName
                ? intl.formatMessage(mapMessages.savedMapOrigin, {
                    project: originProjectName,
                  })
                : intl.formatMessage(mapMessages.savedMapOriginUnavailable)}
            </p>
          ) : null}
          <span className="mt-1 inline-flex rounded-full bg-surface-card px-2 py-0.5 text-xs font-semibold capitalize text-text-muted">
            {intl.formatMessage(
              mapMessages[STATUS_MESSAGE_BY_STATUS[map.status]],
            )}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={isActive ? 'secondary' : 'primary'}
          onClick={onActiveToggle}
          loading={isActivePending}
          disabled={hasPendingAction && !isActivePending}
        >
          {intl.formatMessage(
            isActive ? mapMessages.removeActive : mapMessages.setActive,
          )}
        </Button>
        {map.status === 'ready' ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={onPreview}
            disabled={hasPendingAction}
          >
            {intl.formatMessage(mapMessages.previewAction)}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          onClick={onRename}
          loading={isRenamePending}
          disabled={hasPendingAction && !isRenamePending}
        >
          {intl.formatMessage(mapMessages.rename)}
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={onDelete}
          loading={isDeletePending}
          disabled={hasPendingAction && !isDeletePending}
        >
          {intl.formatMessage(mapMessages.delete)}
        </Button>
      </div>
    </article>
  );
}
