import { valibotResolver } from '@hookform/resolvers/valibot';
import * as v from 'valibot';

import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { defineMessages, useIntl } from 'react-intl';

import { useNavigate } from '@tanstack/react-router';

import { useShellSlot } from '@/components/layout/shell-slot';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCreateAlert } from '@/hooks/useCreateAlert';
import { useProjects } from '@/hooks/useProjects';
import { geometrySchema } from '@/lib/schemas/geometry';
import { useProjectStore } from '@/stores/project-store';

const messages = defineMessages({
  title: {
    id: 'alerts.create.title',
    defaultMessage: 'Create Alert',
  },
  geometryLabel: {
    id: 'alerts.create.geometryLabel',
    defaultMessage: 'Geometry (GeoJSON)',
  },
  geometryPlaceholder: {
    id: 'alerts.create.geometryPlaceholder',
    defaultMessage: '{"type":"Point","coordinates":[0,0]}',
  },
  metadataLabel: {
    id: 'alerts.create.metadataLabel',
    defaultMessage: 'Metadata (JSON, optional)',
  },
  detectionDateStartLabel: {
    id: 'alerts.create.detectionDateStart',
    defaultMessage: 'Detection Date Start',
  },
  detectionDateEndLabel: {
    id: 'alerts.create.detectionDateEnd',
    defaultMessage: 'Detection Date End',
  },
  submit: {
    id: 'alerts.create.submit',
    defaultMessage: 'Create',
  },
  cancel: {
    id: 'alerts.create.cancel',
    defaultMessage: 'Cancel',
  },
  invalidGeometry: {
    id: 'alerts.create.invalidGeometry',
    defaultMessage: 'Invalid GeoJSON geometry',
  },
  required: {
    id: 'alerts.create.required',
    defaultMessage: 'This field is required',
  },
  invalidJson: {
    id: 'alerts.create.invalidJson',
    defaultMessage: 'Invalid JSON',
  },
  noProject: {
    id: 'alerts.create.noProject',
    defaultMessage: 'Select a project first',
  },
  dataLabel: {
    id: 'data.title',
    defaultMessage: 'Data',
  },
  untitledProject: {
    id: 'data.untitledProject',
    defaultMessage: 'Untitled Project',
  },
});

const formSchema = v.object({
  geometry: v.pipe(
    v.string(),
    v.minLength(1, 'required'),
    v.check((value) => {
      try {
        v.parse(geometrySchema, JSON.parse(value));
        return true;
      } catch {
        return false;
      }
    }, 'invalidGeometry'),
  ),
  metadata: v.pipe(
    v.string(),
    v.check((value) => {
      if (value.trim() === '') return true;
      try {
        const parsed: unknown = JSON.parse(value);
        return (
          typeof parsed === 'object' &&
          parsed !== null &&
          !Array.isArray(parsed)
        );
      } catch {
        return false;
      }
    }, 'invalidJson'),
  ),
  detectionDateStart: v.string(),
  detectionDateEnd: v.string(),
});

type FormData = v.InferInput<typeof formSchema>;

function errorMessageKey(
  code: string | undefined,
): keyof typeof messages | undefined {
  if (code === 'required') return 'required';
  if (code === 'invalidGeometry') return 'invalidGeometry';
  if (code === 'invalidJson') return 'invalidJson';
  return undefined;
}

export function CreateAlertScreen() {
  const intl = useIntl();
  const navigate = useNavigate();
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const createAlert = useCreateAlert();
  const projectsQuery = useProjects();
  const projects = projectsQuery.data ?? [];
  const selectedProject = projects.find((p) => p.localId === selectedProjectId);

  const topbarWorkspaceName =
    selectedProject?.name ?? intl.formatMessage(messages.untitledProject);
  const shellSlot = useMemo(
    () => ({
      topbarWorkspaceName: selectedProjectId ? topbarWorkspaceName : undefined,
      topbarModeLabel: intl.formatMessage(messages.dataLabel),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedProjectId, topbarWorkspaceName],
  );
  useShellSlot(shellSlot);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: valibotResolver(formSchema),
    defaultValues: {
      geometry: '',
      metadata: '',
      detectionDateStart: '',
      detectionDateEnd: '',
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

  function onSubmit(data: FormData) {
    if (!selectedProjectId) return;
    const parsedGeometry = JSON.parse(data.geometry) as {
      type: string;
      coordinates: unknown;
    };
    const parsedMetadata = data.metadata.trim()
      ? (JSON.parse(data.metadata) as Record<string, unknown>)
      : undefined;

    createAlert.mutate(
      {
        projectLocalId: selectedProjectId,
        geometry: parsedGeometry,
        metadata: parsedMetadata,
        detectionDateStart: data.detectionDateStart || undefined,
        detectionDateEnd: data.detectionDateEnd || undefined,
      },
      {
        onSuccess: () => {
          void navigate({ to: '/data' });
        },
      },
    );
  }

  const geometryErrorKey = errorMessageKey(errors.geometry?.message);
  const metadataErrorKey = errorMessageKey(errors.metadata?.message);

  return (
    <div className="flex flex-col gap-6 p-3 sm:p-4 lg:p-6">
      <h1 className="text-2xl font-bold text-text">
        {intl.formatMessage(messages.title)}
      </h1>

      <Card className="p-6">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
          noValidate
        >
          <div className="flex flex-col gap-1">
            <label
              htmlFor="alert-geometry"
              className="text-sm font-medium text-text"
            >
              {intl.formatMessage(messages.geometryLabel)}
            </label>
            <textarea
              id="alert-geometry"
              {...register('geometry')}
              placeholder={intl.formatMessage(messages.geometryPlaceholder)}
              rows={4}
              aria-invalid={geometryErrorKey ? true : undefined}
              aria-describedby={
                geometryErrorKey ? 'alert-geometry-error' : undefined
              }
              className="rounded-input border border-border bg-surface-card px-3 py-2 text-sm text-text font-mono placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            {geometryErrorKey && (
              <p
                id="alert-geometry-error"
                role="alert"
                className="text-sm text-error"
              >
                {intl.formatMessage(messages[geometryErrorKey])}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="alert-metadata"
              className="text-sm font-medium text-text"
            >
              {intl.formatMessage(messages.metadataLabel)}
            </label>
            <textarea
              id="alert-metadata"
              {...register('metadata')}
              rows={3}
              aria-invalid={metadataErrorKey ? true : undefined}
              aria-describedby={
                metadataErrorKey ? 'alert-metadata-error' : undefined
              }
              className="rounded-input border border-border bg-surface-card px-3 py-2 text-sm text-text font-mono placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            {metadataErrorKey && (
              <p
                id="alert-metadata-error"
                role="alert"
                className="text-sm text-error"
              >
                {intl.formatMessage(messages[metadataErrorKey])}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="alert-date-start"
                className="text-sm font-medium text-text"
              >
                {intl.formatMessage(messages.detectionDateStartLabel)}
              </label>
              <input
                id="alert-date-start"
                type="date"
                {...register('detectionDateStart')}
                className="rounded-input border border-border bg-surface-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="alert-date-end"
                className="text-sm font-medium text-text"
              >
                {intl.formatMessage(messages.detectionDateEndLabel)}
              </label>
              <input
                id="alert-date-end"
                type="date"
                {...register('detectionDateEnd')}
                className="rounded-input border border-border bg-surface-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
          </div>

          {!selectedProjectId && (
            <p role="alert" className="text-sm text-error">
              {intl.formatMessage(messages.noProject)}
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-3">
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
              onClick={() => navigate({ to: '/data' })}
            >
              {intl.formatMessage(messages.cancel)}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
