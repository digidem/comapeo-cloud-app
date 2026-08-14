import { useMemo } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { useNavigate } from '@tanstack/react-router';

import { useShellSlot } from '@/components/layout/shell-slot';
import { AlertForm } from '@/components/shared/AlertForm';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjects } from '@/hooks/useProjects';
import { useProjectStore } from '@/stores/project-store';

const messages = defineMessages({
  title: { id: 'alerts.create.title', defaultMessage: 'Create Alert' },
  alertsLabel: { id: 'alerts.title', defaultMessage: 'Alerts' },
  untitledProject: {
    id: 'data.untitledProject',
    defaultMessage: 'Untitled Project',
  },
});

export function CreateAlertScreen() {
  const intl = useIntl();
  const navigate = useNavigate();
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const projectsQuery = useProjects();
  const projects = projectsQuery.data ?? [];
  const selectedProject = projects.find((p) => p.localId === selectedProjectId);

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

  if (projectsQuery.isPending) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton height={24} width={200} />
        <Skeleton height={100} className="rounded-card" />
        <Skeleton height={100} className="rounded-card" />
      </div>
    );
  }

  const navigateToAlerts = () => void navigate({ to: '/alerts' });

  return (
    <div className="flex flex-col gap-6 p-3 sm:p-4 lg:p-6">
      <h1 className="text-2xl font-bold text-text">
        {intl.formatMessage(messages.title)}
      </h1>
      <Card className="p-6">
        <AlertForm
          projectLocalId={selectedProjectId ?? undefined}
          onCancel={navigateToAlerts}
          onSuccess={navigateToAlerts}
        />
      </Card>
    </div>
  );
}
