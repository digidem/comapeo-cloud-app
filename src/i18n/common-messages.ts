import { defineMessages } from 'react-intl';

const commonMessages = defineMessages({
  createProject: {
    id: 'common.createProject',
    defaultMessage: 'Create Project',
  },
  /**
   * Shared toast action label for the storage-cleanup recovery path. Used by
   * the per-archive trigger and the global sync-all aggregate alike.
   */
  openSettingsAction: {
    id: 'sync.toast.openSettingsAction',
    defaultMessage: 'Open Settings',
  },
});

export { commonMessages };
