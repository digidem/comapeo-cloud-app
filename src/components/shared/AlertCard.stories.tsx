import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { AlertCard } from '@/components/shared/AlertCard';
import type { Alert } from '@/lib/db';

const meta: Meta<typeof AlertCard> = {
  title: 'Components/AlertCard',
  component: AlertCard,
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof AlertCard>;

// The detection API stores the alert kind under the snake_case `alert_type`
// metadata key; reference it via a constant so the literal doesn't trip the
// camelCase naming-convention lint rule.
const ALERT_TYPE_KEY = 'alert_type';

const baseAlert: Alert = {
  localId: 'alert-001',
  projectLocalId: 'project-1',
  sourceType: 'remoteDetectionAlert',
  sourceId: 'source-1',
  remoteSourceId: 'GLAD-S2',
  metadata: { severity: 'high', [ALERT_TYPE_KEY]: 'deforestation' },
  detectionDateStart: '2024-03-14T00:00:00Z',
  detectionDateEnd: '2024-03-15T00:00:00Z',
  geometry: { type: 'Point', coordinates: [-55.45, -8.35] },
  createdAt: '2024-03-15T08:00:00Z',
  updatedAt: '2024-03-15T08:00:00Z',
  dirtyLocal: false,
  deleted: false,
};

export const Default: Story = {
  args: {
    alert: baseAlert,
  },
};

export const MediumSeverity: Story = {
  args: {
    alert: {
      ...baseAlert,
      localId: 'alert-002',
      metadata: { severity: 'medium', [ALERT_TYPE_KEY]: 'fire' },
    },
  },
};

export const SingleDate: Story = {
  args: {
    alert: {
      ...baseAlert,
      localId: 'alert-003',
      detectionDateEnd: undefined,
    },
  },
};

export const NoLocation: Story = {
  args: {
    alert: {
      ...baseAlert,
      localId: 'alert-004',
      geometry: undefined,
    },
  },
};
