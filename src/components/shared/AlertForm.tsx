import { valibotResolver } from '@hookform/resolvers/valibot';
import * as v from 'valibot';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { defineMessages, useIntl } from 'react-intl';

import {
  GeometryPicker,
  type GeometryPickerProps,
} from '@/components/shared/GeometryPicker';
import { MetadataFields } from '@/components/shared/MetadataFields';
import { Button } from '@/components/ui/button';
import { useCreateAlert } from '@/hooks/useCreateAlert';
import {
  type AlertGeometry,
  type MetadataRow,
  metadataRowsToRecord,
} from '@/lib/alert-form-utils';

const messages = defineMessages({
  geometryLabel: {
    id: 'alerts.create.geometryLabel',
    defaultMessage: 'Location and shape',
  },
  geometryRequired: {
    id: 'alerts.create.geometryRequired',
    defaultMessage: 'Choose a valid alert location or shape.',
  },
  geometrySelected: {
    id: 'alerts.create.geometrySelected',
    defaultMessage: 'Selected geometry: {type}',
  },
  metadataKeyRequired: {
    id: 'alerts.create.metadataKeyRequired',
    defaultMessage: 'Field name is required.',
  },
  metadataDuplicateKey: {
    id: 'alerts.create.metadataDuplicateKey',
    defaultMessage: 'Field names must be unique.',
  },
  metadataInvalidNumber: {
    id: 'alerts.create.metadataInvalidNumber',
    defaultMessage: 'Enter a valid number.',
  },
  metadataInvalidBoolean: {
    id: 'alerts.create.metadataInvalidBoolean',
    defaultMessage: 'Choose true or false.',
  },
  detectionDateStartLabel: {
    id: 'alerts.create.detectionDateStart',
    defaultMessage: 'Detection Date Start',
  },
  detectionDateEndLabel: {
    id: 'alerts.create.detectionDateEnd',
    defaultMessage: 'Detection Date End',
  },
  sourceIdLabel: { id: 'alerts.create.sourceId', defaultMessage: 'Source ID' },
  alertTypeLabel: {
    id: 'alerts.create.alertType',
    defaultMessage: 'Alert Type',
  },
  requiredField: {
    id: 'alerts.create.requiredField',
    defaultMessage: 'This field is required.',
  },
  submit: { id: 'alerts.create.submit', defaultMessage: 'Create' },
  cancel: { id: 'alerts.create.cancel', defaultMessage: 'Cancel' },
  noProject: {
    id: 'alerts.create.noProject',
    defaultMessage: 'Select a project first',
  },
  createFailed: {
    id: 'alerts.create.failed',
    defaultMessage: 'Could not create the alert. Try again.',
  },
});

const dateInput = v.pipe(
  v.string(),
  v.minLength(1),
  v.regex(/^\d{4}-\d{2}-\d{2}$/),
);
const formSchema = v.object({
  detectionDateStart: dateInput,
  detectionDateEnd: dateInput,
  sourceId: v.pipe(v.string(), v.trim(), v.minLength(1)),
  alertType: v.pipe(v.string(), v.trim(), v.minLength(1)),
});
type FormData = v.InferOutput<typeof formSchema>;

type AlertGeometryPickerProps = Pick<
  GeometryPickerProps,
  'showMap' | 'allowedTypes' | 'externalPoint'
>;

export interface AlertFormProps {
  projectLocalId?: string;
  onCancel: () => void;
  onSuccess?: () => void;
  onGeometryChange?: (geometry: AlertGeometry | undefined) => void;
  geometryPickerProps?: AlertGeometryPickerProps;
  compact?: boolean;
}

function dateInputToIso(date: string, endOfDay = false) {
  return `${date}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`;
}

export function AlertForm({
  projectLocalId,
  onCancel,
  onSuccess,
  onGeometryChange,
  geometryPickerProps,
  compact = false,
}: AlertFormProps) {
  const intl = useIntl();
  const createAlert = useCreateAlert();
  const previousProjectLocalIdRef = useRef(projectLocalId);
  const [geometry, setGeometry] = useState<AlertGeometry>();
  const [geometryMessage, setGeometryMessage] = useState<string>();
  const [geometrySubmitError, setGeometrySubmitError] = useState(false);
  const [metadataRows, setMetadataRows] = useState<MetadataRow[]>([]);
  const [metadataErrors, setMetadataErrors] = useState<Record<string, string>>(
    {},
  );

  const {
    register,
    handleSubmit,
    formState: { errors: formErrors },
  } = useForm<FormData>({
    resolver: valibotResolver(formSchema),
    defaultValues: {
      detectionDateStart: '',
      detectionDateEnd: '',
      sourceId: '',
      alertType: '',
    },
  });

  useEffect(() => {
    if (previousProjectLocalIdRef.current === projectLocalId) return;
    previousProjectLocalIdRef.current = projectLocalId;
    setGeometry(undefined);
    setGeometryMessage(undefined);
    setGeometrySubmitError(false);
    onGeometryChange?.(undefined);
  }, [onGeometryChange, projectLocalId]);

  function translateMetadataErrors(errors: Record<string, string>) {
    const messageFor = (code: string) => {
      if (code === 'keyRequired') {
        return intl.formatMessage(messages.metadataKeyRequired);
      }
      if (code === 'duplicateKey') {
        return intl.formatMessage(messages.metadataDuplicateKey);
      }
      if (code === 'invalidNumber') {
        return intl.formatMessage(messages.metadataInvalidNumber);
      }
      return intl.formatMessage(messages.metadataInvalidBoolean);
    };
    return Object.fromEntries(
      Object.entries(errors).map(([id, code]) => [id, messageFor(code)]),
    );
  }

  function updateGeometry(next: AlertGeometry | undefined) {
    setGeometry(next);
    onGeometryChange?.(next);
    if (next) setGeometrySubmitError(false);
  }

  function clearDraftAndCancel() {
    setGeometry(undefined);
    setGeometryMessage(undefined);
    setGeometrySubmitError(false);
    setMetadataRows([]);
    setMetadataErrors({});
    onGeometryChange?.(undefined);
    onCancel();
  }

  function onSubmit(data: FormData) {
    if (!projectLocalId) return;
    if (!geometry) {
      setGeometrySubmitError(true);
      return;
    }
    const metadata = metadataRowsToRecord(metadataRows);
    if (Object.keys(metadata.errors).length > 0) {
      setMetadataErrors(translateMetadataErrors(metadata.errors));
      return;
    }
    setMetadataErrors({});
    createAlert.mutate(
      {
        projectLocalId,
        geometry,
        metadata: { ...metadata.value, ['alert_type']: data.alertType },
        detectionDateStart: dateInputToIso(data.detectionDateStart),
        detectionDateEnd: dateInputToIso(data.detectionDateEnd, true),
        sourceId: data.sourceId,
      },
      {
        onSuccess: () => {
          onGeometryChange?.(undefined);
          onSuccess?.();
        },
      },
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-5"
      noValidate
    >
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-text">
          {intl.formatMessage(messages.geometryLabel)}
        </h2>
        <GeometryPicker
          projectLocalId={projectLocalId}
          onChange={updateGeometry}
          onValidationChange={setGeometryMessage}
          {...geometryPickerProps}
        />
        {geometry && (
          <p className="text-sm text-text-muted">
            {intl.formatMessage(messages.geometrySelected, {
              type: geometry.type,
            })}
          </p>
        )}
        {(geometrySubmitError || geometryMessage) && (
          <p role="alert" className="text-sm text-error">
            {geometryMessage ?? intl.formatMessage(messages.geometryRequired)}
          </p>
        )}
      </div>

      <div
        className={
          compact
            ? 'grid grid-cols-1 gap-4 sm:grid-cols-2'
            : 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'
        }
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-text">
          {intl.formatMessage(messages.detectionDateStartLabel)}
          <input
            type="date"
            {...register('detectionDateStart')}
            aria-invalid={!!formErrors.detectionDateStart}
            className="rounded-input border border-border bg-surface-card px-3 py-2 text-sm"
          />
          {formErrors.detectionDateStart && (
            <span className="text-xs text-error">
              {intl.formatMessage(messages.requiredField)}
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-text">
          {intl.formatMessage(messages.detectionDateEndLabel)}
          <input
            type="date"
            {...register('detectionDateEnd')}
            aria-invalid={!!formErrors.detectionDateEnd}
            className="rounded-input border border-border bg-surface-card px-3 py-2 text-sm"
          />
          {formErrors.detectionDateEnd && (
            <span className="text-xs text-error">
              {intl.formatMessage(messages.requiredField)}
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-text">
          {intl.formatMessage(messages.sourceIdLabel)}
          <input
            type="text"
            {...register('sourceId')}
            aria-invalid={!!formErrors.sourceId}
            className="rounded-input border border-border bg-surface-card px-3 py-2 text-sm"
          />
          {formErrors.sourceId && (
            <span className="text-xs text-error">
              {intl.formatMessage(messages.requiredField)}
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-text">
          {intl.formatMessage(messages.alertTypeLabel)}
          <input
            type="text"
            {...register('alertType')}
            aria-invalid={!!formErrors.alertType}
            className="rounded-input border border-border bg-surface-card px-3 py-2 text-sm"
          />
          {formErrors.alertType && (
            <span className="text-xs text-error">
              {intl.formatMessage(messages.requiredField)}
            </span>
          )}
        </label>
      </div>

      <MetadataFields
        rows={metadataRows}
        onChange={(rows) => {
          setMetadataRows(rows);
          setMetadataErrors({});
        }}
        errors={metadataErrors}
      />

      {!projectLocalId && (
        <p role="alert" className="text-sm text-error">
          {intl.formatMessage(messages.noProject)}
        </p>
      )}
      {createAlert.isError && (
        <p role="alert" className="text-sm text-error">
          {intl.formatMessage(messages.createFailed)}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row">
        <Button
          type="submit"
          variant="primary"
          disabled={createAlert.isPending || !projectLocalId}
        >
          {intl.formatMessage(messages.submit)}
        </Button>
        <Button type="button" variant="secondary" onClick={clearDraftAndCancel}>
          {intl.formatMessage(messages.cancel)}
        </Button>
      </div>
    </form>
  );
}
