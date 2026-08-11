import { valibotResolver } from '@hookform/resolvers/valibot';
import * as v from 'valibot';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { defineMessages, useIntl } from 'react-intl';

import { useNavigate } from '@tanstack/react-router';

import { useShellSlot } from '@/components/layout/shell-slot';
import { GeometryPicker } from '@/components/shared/GeometryPicker';
import { MetadataFields } from '@/components/shared/MetadataFields';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCreateAlert } from '@/hooks/useCreateAlert';
import { useProjects } from '@/hooks/useProjects';
import {
  type AlertGeometry,
  type MetadataRow,
  metadataRowsToRecord,
} from '@/lib/alert-form-utils';
import { useProjectStore } from '@/stores/project-store';

const messages = defineMessages({
  title: { id: 'alerts.create.title', defaultMessage: 'Create Alert' },
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
  alertsLabel: { id: 'alerts.title', defaultMessage: 'Alerts' },
  untitledProject: {
    id: 'data.untitledProject',
    defaultMessage: 'Untitled Project',
  },
});

const formSchema = v.object({
  detectionDateStart: v.string(),
  detectionDateEnd: v.string(),
  sourceId: v.string(),
});
type FormData = v.InferInput<typeof formSchema>;

export function CreateAlertScreen() {
  const intl = useIntl();
  const navigate = useNavigate();
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const createAlert = useCreateAlert();
  const projectsQuery = useProjects();
  const projects = projectsQuery.data ?? [];
  const selectedProject = projects.find((p) => p.localId === selectedProjectId);
  const [geometryState, setGeometryState] = useState<{
    projectLocalId: string;
    value: AlertGeometry;
  }>();
  const geometry =
    geometryState?.projectLocalId === selectedProjectId
      ? geometryState.value
      : undefined;
  const [geometryMessageState, setGeometryMessageState] = useState<{
    projectLocalId: string;
    message: string;
  }>();
  const geometryMessage =
    geometryMessageState?.projectLocalId === selectedProjectId
      ? geometryMessageState.message
      : undefined;
  const [geometrySubmitErrorProjectId, setGeometrySubmitErrorProjectId] =
    useState<string>();
  const geometrySubmitError =
    geometrySubmitErrorProjectId === selectedProjectId;
  const [metadataRows, setMetadataRows] = useState<MetadataRow[]>([]);
  const [metadataErrors, setMetadataErrors] = useState<Record<string, string>>(
    {},
  );

  const topbarWorkspaceName =
    selectedProject?.name ?? intl.formatMessage(messages.untitledProject);
  const shellSlot = useMemo(
    () => ({
      topbarWorkspaceName: selectedProjectId ? topbarWorkspaceName : undefined,
      topbarModeLabel: intl.formatMessage(messages.alertsLabel),
    }),
    [intl, selectedProjectId, topbarWorkspaceName],
  );
  useShellSlot(shellSlot);

  const { register, handleSubmit } = useForm<FormData>({
    resolver: valibotResolver(formSchema),
    defaultValues: {
      detectionDateStart: '',
      detectionDateEnd: '',
      sourceId: '',
    },
  });

  if (projectsQuery.isPending) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton height={24} width={200} />
        <Skeleton height={100} className="rounded-card" />
        <Skeleton height={100} className="rounded-card" />
      </div>
    );
  }

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

  function onSubmit(data: FormData) {
    if (!selectedProjectId) return;
    if (!geometry) {
      setGeometrySubmitErrorProjectId(selectedProjectId);
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
        projectLocalId: selectedProjectId,
        geometry,
        metadata: metadata.value,
        detectionDateStart: data.detectionDateStart || undefined,
        detectionDateEnd: data.detectionDateEnd || undefined,
        sourceId: data.sourceId || undefined,
      },
      { onSuccess: () => void navigate({ to: '/alerts' }) },
    );
  }

  return (
    <div className="flex flex-col gap-6 p-3 sm:p-4 lg:p-6">
      <h1 className="text-2xl font-bold text-text">
        {intl.formatMessage(messages.title)}
      </h1>
      <Card className="p-6">
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
              key={selectedProjectId ?? 'no-project'}
              projectLocalId={selectedProjectId ?? undefined}
              onChange={(next) => {
                setGeometryState(
                  next && selectedProjectId
                    ? { projectLocalId: selectedProjectId, value: next }
                    : undefined,
                );
                if (next) setGeometrySubmitErrorProjectId(undefined);
              }}
              onValidationChange={(message) =>
                setGeometryMessageState(
                  message && selectedProjectId
                    ? { projectLocalId: selectedProjectId, message }
                    : undefined,
                )
              }
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
                {geometryMessage ??
                  intl.formatMessage(messages.geometryRequired)}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm font-medium text-text">
              {intl.formatMessage(messages.detectionDateStartLabel)}
              <input
                type="date"
                {...register('detectionDateStart')}
                className="rounded-input border border-border bg-surface-card px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-text">
              {intl.formatMessage(messages.detectionDateEndLabel)}
              <input
                type="date"
                {...register('detectionDateEnd')}
                className="rounded-input border border-border bg-surface-card px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-text">
              {intl.formatMessage(messages.sourceIdLabel)}
              <input
                type="text"
                {...register('sourceId')}
                className="rounded-input border border-border bg-surface-card px-3 py-2 text-sm"
              />
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
          {!selectedProjectId && (
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
              disabled={createAlert.isPending || !selectedProjectId}
            >
              {intl.formatMessage(messages.submit)}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate({ to: '/alerts' })}
            >
              {intl.formatMessage(messages.cancel)}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
