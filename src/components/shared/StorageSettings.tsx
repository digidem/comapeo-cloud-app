import { useCallback, useEffect, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  type StorageStats,
  clearAllData,
  getStorageStats,
} from '@/lib/storage';

const messages = defineMessages({
  storageTitle: {
    id: 'settings.storage.title',
    defaultMessage: 'Storage',
  },
  storageDescription: {
    id: 'settings.storage.description',
    defaultMessage: 'Manage cached data stored in your browser.',
  },
  totalUsage: {
    id: 'settings.storage.totalUsage',
    defaultMessage: 'Total Usage',
  },
  totalOf: {
    id: 'settings.storage.totalOf',
    defaultMessage: '{usage} of {quota}',
  },
  recordsLabel: {
    id: 'settings.storage.records',
    defaultMessage: '{count} records',
  },
  projectsLabel: {
    id: 'settings.storage.projects',
    defaultMessage: 'Projects',
  },
  observationsLabel: {
    id: 'settings.storage.observations',
    defaultMessage: 'Observations',
  },
  alertsLabel: {
    id: 'settings.storage.alerts',
    defaultMessage: 'Alerts',
  },
  presetsLabel: {
    id: 'settings.storage.presets',
    defaultMessage: 'Presets',
  },
  attachmentsLabel: {
    id: 'settings.storage.attachments',
    defaultMessage: 'Attachments',
  },
  serversLabel: {
    id: 'settings.storage.servers',
    defaultMessage: 'Servers',
  },
  syncMetadataLabel: {
    id: 'settings.storage.syncMetadata',
    defaultMessage: 'Sync Metadata',
  },
  clearButton: {
    id: 'settings.storage.clearButton',
    defaultMessage: 'Clear All Cached Data',
  },
  clearConfirmTitle: {
    id: 'settings.storage.clearConfirmTitle',
    defaultMessage: 'Clear All Cached Data?',
  },
  clearConfirmDescription: {
    id: 'settings.storage.clearConfirmDescription',
    defaultMessage:
      'This will remove all locally cached data including projects, observations, alerts, and attachments. Data will need to be re-synced. This cannot be undone.',
  },
  clearConfirmButton: {
    id: 'settings.storage.clearConfirmButton',
    defaultMessage: 'Yes, Clear Everything',
  },
  clearCancelButton: {
    id: 'settings.storage.clearCancelButton',
    defaultMessage: 'Cancel',
  },
});

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

interface TableRow {
  label: string;
  count: number;
}

function TableRowItem({ label, count }: TableRow) {
  return (
    <div
      role="row"
      className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-b-0"
    >
      <span role="cell" className="text-sm text-text">
        {label}
      </span>
      <span role="cell" className="text-sm text-text-muted tabular-nums">
        {count}
      </span>
    </div>
  );
}

interface UsageBarProps {
  percent: number;
}

function getBarColor(percent: number): string {
  if (percent > 90) return '#ef4444';
  if (percent > 70) return '#f59e0b';
  return '#1F6FFF';
}

function UsageBar({ percent }: UsageBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div
      className="w-full bg-surface rounded-full h-2 mt-1 mb-2"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${clamped}% storage used`}
    >
      <div
        className="h-2 rounded-full transition-all duration-300"
        style={{
          width: `${clamped}%`,
          backgroundColor: getBarColor(clamped),
        }}
      />
    </div>
  );
}

export function StorageSettings() {
  const intl = useIntl();
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStorageStats()
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch((err) => {
        console.warn('Failed to load storage stats:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getStorageStats();
      setStats(result);
    } catch (err) {
      console.warn('Failed to load storage stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClearAll = useCallback(async () => {
    if (clearing) return;
    setClearing(true);
    setClearError(null);
    try {
      await clearAllData();
      await loadStats();
      setIsConfirmOpen(false);
    } catch (err) {
      setClearError(
        err instanceof Error ? err.message : 'Failed to clear data',
      );
    } finally {
      setClearing(false);
    }
  }, [loadStats, clearing]);

  if (loading) {
    return (
      <div className="mt-4 space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="space-y-2 mt-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const tableRows: TableRow[] = [
    {
      label: intl.formatMessage(messages.projectsLabel),
      count: stats?.tables.projects.count ?? 0,
    },
    {
      label: intl.formatMessage(messages.observationsLabel),
      count: stats?.tables.observations.count ?? 0,
    },
    {
      label: intl.formatMessage(messages.alertsLabel),
      count: stats?.tables.alerts.count ?? 0,
    },
    {
      label: intl.formatMessage(messages.presetsLabel),
      count: stats?.tables.presets.count ?? 0,
    },
    {
      label: intl.formatMessage(messages.attachmentsLabel),
      count: stats?.tables.attachments.count ?? 0,
    },
    {
      label: intl.formatMessage(messages.serversLabel),
      count: stats?.tables.remoteServers.count ?? 0,
    },
    {
      label: intl.formatMessage(messages.syncMetadataLabel),
      count: stats?.tables.syncMetadata.count ?? 0,
    },
  ];

  const totalRecords = tableRows.reduce((sum, r) => sum + r.count, 0);

  return (
    <div>
      <h2 className="text-lg font-semibold text-text mt-6">
        {intl.formatMessage(messages.storageTitle)}
      </h2>
      <p className="text-sm text-text-muted mt-2">
        {intl.formatMessage(messages.storageDescription)}
      </p>

      <Card className="mt-4 p-4 max-w-md">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-text">
            {intl.formatMessage(messages.totalUsage)}
          </span>
          <span className="text-xs text-text-muted tabular-nums">
            {intl.formatMessage(messages.totalOf, {
              usage: formatBytes(stats?.usage ?? 0),
              quota: formatBytes(stats?.quota ?? 0),
            })}
          </span>
        </div>
        <UsageBar percent={stats?.usagePercent ?? 0} />
        <p className="text-xs text-text-muted tabular-nums">
          {stats?.usagePercent.toFixed(1) ?? '0.0'}% used
        </p>
      </Card>

      <Card className="mt-3 p-4 max-w-md" role="table">
        <div role="row" className="text-sm font-medium text-text mb-2">
          <span role="columnheader">
            {intl.formatMessage(messages.recordsLabel, { count: totalRecords })}
          </span>
        </div>
        {tableRows.map((row) => (
          <TableRowItem key={row.label} label={row.label} count={row.count} />
        ))}
      </Card>

      <div className="mt-4 max-w-md">
        <Button
          variant="danger"
          onClick={() => setIsConfirmOpen(true)}
          loading={clearing}
          className="w-full sm:w-auto"
          aria-haspopup="dialog"
        >
          {intl.formatMessage(messages.clearButton)}
        </Button>
      </div>

      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={(open) => {
          setIsConfirmOpen(open);
          if (!open) setClearError(null);
        }}
        title={intl.formatMessage(messages.clearConfirmTitle)}
        description={intl.formatMessage(messages.clearConfirmDescription)}
        confirmLabel={intl.formatMessage(messages.clearConfirmButton)}
        variant="destructive"
        onConfirm={handleClearAll}
      >
        {clearError !== null && (
          <p className="text-sm text-red-600">{clearError}</p>
        )}
      </ConfirmDialog>
    </div>
  );
}
