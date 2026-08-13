import * as Dialog from '@radix-ui/react-dialog';

import { defineMessages, useIntl } from 'react-intl';

import { AlertForm } from '@/components/shared/AlertForm';
import { CloseIcon } from '@/components/ui/close-icon';
import type { AlertGeometry } from '@/lib/alert-form-utils';

const messages = defineMessages({
  createAlertTitle: {
    id: 'alerts.create.title',
    defaultMessage: 'Create Alert',
  },
  closeCreateAlert: {
    id: 'alerts.create.close',
    defaultMessage: 'Close create alert',
  },
  selectOnMap: {
    id: 'alerts.create.selectOnMap',
    defaultMessage: 'Select on map',
  },
  changeOnMap: {
    id: 'alerts.create.changeOnMap',
    defaultMessage: 'Change location on map',
  },
  tapMapToPlace: {
    id: 'alerts.create.tapMapToPlace',
    defaultMessage: 'Tap the map to place the alert point',
  },
  backToForm: {
    id: 'alerts.create.backToForm',
    defaultMessage: 'Back to form',
  },
});

interface InlineAlertCreationPanelProps {
  projectLocalId: string;
  mapSelectedPoint?: [number, number];
  isSelectingMapOnMobile: boolean;
  onSelectMapMobile: () => void;
  onBackToForm: () => void;
  onGeometryChange: (geometry: AlertGeometry | undefined) => void;
  onClose: () => void;
}

export function InlineAlertCreationPanel({
  projectLocalId,
  mapSelectedPoint,
  isSelectingMapOnMobile,
  onSelectMapMobile,
  onBackToForm,
  onGeometryChange,
  onClose,
}: InlineAlertCreationPanelProps) {
  const intl = useIntl();

  return (
    <>
      <Dialog.Root open modal={false}>
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="inline-alert-sheet"
          className={`absolute inset-x-0 bottom-0 z-40 max-h-[85%] flex-col rounded-t-card border border-border/20 bg-surface-card shadow-elevated focus:outline-none md:inset-y-3 md:right-3 md:left-auto md:m-0 md:flex md:w-[28rem] md:max-h-none md:rounded-card ${
            isSelectingMapOnMobile ? 'hidden' : 'flex'
          }`}
          style={{ animation: 'slideUp 200ms ease-out' }}
        >
          <div className="flex justify-center pt-3 pb-1 md:hidden">
            <div
              aria-hidden="true"
              className="h-1 w-10 rounded-full bg-border"
            />
          </div>
          <div className="flex items-center justify-between border-b border-border/20 px-4 py-3">
            <Dialog.Title className="text-lg font-bold text-text">
              {intl.formatMessage(messages.createAlertTitle)}
            </Dialog.Title>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
              aria-label={intl.formatMessage(messages.closeCreateAlert)}
              style={{ touchAction: 'manipulation' }}
            >
              <CloseIcon size={20} />
            </button>
          </div>
          <div className="overflow-y-auto p-4">
            <button
              type="button"
              onClick={onSelectMapMobile}
              className="mb-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-button border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
              style={{ touchAction: 'manipulation' }}
            >
              {intl.formatMessage(
                mapSelectedPoint ? messages.changeOnMap : messages.selectOnMap,
              )}
            </button>
            <AlertForm
              projectLocalId={projectLocalId}
              compact
              geometryPickerProps={{
                showMap: false,
                allowedTypes: ['Point'],
                externalPoint: mapSelectedPoint,
              }}
              onGeometryChange={onGeometryChange}
              onCancel={onClose}
              onSuccess={onClose}
            />
          </div>
        </Dialog.Content>
      </Dialog.Root>

      {isSelectingMapOnMobile ? (
        <div className="absolute inset-x-3 bottom-3 z-40 flex items-center justify-between gap-3 rounded-card bg-surface-card p-3 shadow-elevated md:hidden">
          <span className="text-sm font-medium text-text">
            {intl.formatMessage(messages.tapMapToPlace)}
          </span>
          <button
            type="button"
            onClick={onBackToForm}
            className="min-h-[44px] shrink-0 rounded-button border border-border bg-surface px-3 py-2 text-sm font-medium text-text"
          >
            {intl.formatMessage(messages.backToForm)}
          </button>
        </div>
      ) : null}
    </>
  );
}
