import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { ExportObservationsButton } from '@/components/shared/ExportObservationsButton';
import { ToastProvider } from '@/components/ui/toast';
import type { Observation } from '@/lib/data-layer';

// ---- Helpers ----

function makeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    localId: 'obs-1',
    projectLocalId: 'proj-1',
    sourceType: 'local',
    sourceId: 'local-1',
    createdAt: '2024-03-15T10:30:00Z',
    updatedAt: '2024-03-15T10:30:00Z',
    dirtyLocal: false,
    deleted: false,
    ...overrides,
  };
}

const sampleObservations: Observation[] = [
  makeObservation(),
  makeObservation({ localId: 'obs-2', lat: -3.5, lon: -60.2 }),
];

// ---- Meta ----

const meta: Meta<typeof ExportObservationsButton> = {
  title: 'Components/ExportObservationsButton',
  component: ExportObservationsButton,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
  args: {
    observations: sampleObservations,
    projectName: 'Amazon Rainforest Monitoring',
    disabled: false,
  },
};

export default meta;
type Story = StoryObj<typeof ExportObservationsButton>;

// ---- Stories ----

/** Default state — Export button visible, dropdown closed */
export const Default: Story = {};

/**
 * Bottom sheet open showing CSV and GeoJSON export options.
 *
 * TODO: Re-enable play() tests when Storybook vitest-browser rendering
 * issue is resolved (stories with play() hang in sb-preparing-story state).
 * @see https://github.com/storybookjs/storybook/issues/18663
 */
export const Open: Story = {};
