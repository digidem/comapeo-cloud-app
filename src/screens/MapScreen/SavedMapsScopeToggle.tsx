import { useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';

import { mapMessages } from './messages';

export type SavedMapsScope = 'project' | 'all';

interface SavedMapsScopeToggleProps {
  scope: SavedMapsScope;
  disabled: boolean;
  onScopeChange: (scope: SavedMapsScope) => void;
}

export function SavedMapsScopeToggle({
  scope,
  disabled,
  onScopeChange,
}: SavedMapsScopeToggleProps) {
  const intl = useIntl();

  return (
    <div
      role="group"
      aria-label={intl.formatMessage(mapMessages.savedMapsScopeLabel)}
      className="flex flex-wrap gap-2"
    >
      <Button
        size="sm"
        variant={scope === 'project' ? 'primary' : 'secondary'}
        aria-pressed={scope === 'project'}
        onClick={() => onScopeChange('project')}
        disabled={disabled}
      >
        {intl.formatMessage(mapMessages.savedMapsThisProject)}
      </Button>
      <Button
        size="sm"
        variant={scope === 'all' ? 'primary' : 'secondary'}
        aria-pressed={scope === 'all'}
        onClick={() => onScopeChange('all')}
        disabled={disabled}
      >
        {intl.formatMessage(mapMessages.savedMapsAllProjects)}
      </Button>
    </div>
  );
}
