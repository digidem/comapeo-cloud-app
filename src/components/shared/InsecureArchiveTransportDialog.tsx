import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { normalizeArchiveBaseUrl } from '@/lib/archive-proxy';
import type { ArchiveTransportDecision } from '@/lib/archive-transport-gate';

const messages = defineMessages({
  title: {
    id: 'archiveTransport.insecure.title',
    defaultMessage: 'Insecure archive connection',
  },
  description: {
    id: 'archiveTransport.insecure.description',
    defaultMessage:
      "This archive uses HTTP. The connection from CoMapeo Cloud's proxy to the archive server is not encrypted.",
  },
  warning: {
    id: 'archiveTransport.insecure.warning',
    defaultMessage:
      'Your bearer token and archive data can be exposed in transit. HTTPS is strongly recommended.',
  },
  confirm: {
    id: 'archiveTransport.insecure.confirm',
    defaultMessage: 'Connect insecurely',
  },
  cancel: {
    id: 'archiveTransport.insecure.cancel',
    defaultMessage: 'Cancel',
  },
});

interface PendingApproval {
  normalizedUrl: string;
  resolve: (decision: ArchiveTransportDecision) => void;
}

export interface ArchiveTransportApprovalController {
  confirmInsecure: (normalizedUrl: string) => Promise<ArchiveTransportDecision>;
  pendingUrl: string | null;
  confirm: () => void;
  cancel: () => void;
}

function normalizedOrNull(value: string): string | null {
  const normalized = normalizeArchiveBaseUrl(value);
  return normalized.ok ? normalized.value : null;
}

export function useArchiveTransportApproval(
  currentBaseUrl: string,
): ArchiveTransportApprovalController {
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const pendingRef = useRef<PendingApproval | null>(null);

  const settle = useCallback((decision: ArchiveTransportDecision) => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    setPendingUrl(null);
    pending.resolve(decision);
  }, []);

  const cancel = useCallback(() => {
    settle({ kind: 'cancelled' });
  }, [settle]);

  const confirm = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    if (normalizedOrNull(currentBaseUrl) !== pending.normalizedUrl) {
      settle({ kind: 'cancelled' });
      return;
    }
    settle({ kind: 'approved', normalizedUrl: pending.normalizedUrl });
  }, [currentBaseUrl, settle]);

  const confirmInsecure = useCallback((normalizedUrl: string) => {
    if (pendingRef.current) {
      pendingRef.current.resolve({ kind: 'cancelled' });
    }
    setPendingUrl(normalizedUrl);
    return new Promise<ArchiveTransportDecision>((resolve) => {
      pendingRef.current = { normalizedUrl, resolve };
    });
  }, []);

  useLayoutEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    if (normalizedOrNull(currentBaseUrl) !== pending.normalizedUrl) {
      settle({ kind: 'cancelled' });
    }
  }, [currentBaseUrl, settle]);

  useEffect(
    () => () => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      pending?.resolve({ kind: 'cancelled' });
    },
    [],
  );

  return { confirmInsecure, pendingUrl, confirm, cancel };
}

export function InsecureArchiveTransportDialog({
  controller,
}: {
  controller: ArchiveTransportApprovalController;
}) {
  const intl = useIntl();
  return (
    <ConfirmDialog
      open={controller.pendingUrl !== null}
      onOpenChange={(open) => {
        if (!open) controller.cancel();
      }}
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(messages.description)}
      confirmLabel={intl.formatMessage(messages.confirm)}
      cancelLabel={intl.formatMessage(messages.cancel)}
      onConfirm={controller.confirm}
    >
      <p className="text-sm font-medium text-warning">
        {intl.formatMessage(messages.warning)}
      </p>
      {controller.pendingUrl && (
        <p className="mt-3 break-all rounded-md bg-surface px-3 py-2 font-mono text-xs text-text-muted">
          {controller.pendingUrl}
        </p>
      )}
    </ConfirmDialog>
  );
}
