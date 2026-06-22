import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect, userEvent } from 'storybook/test';

import { ExportObservationsButton } from '@/components/shared/ExportObservationsButton';
import { ToastProvider } from '@/components/ui/toast';
import type { Observation } from '@/lib/data-layer';
import { PLAY_TIMEOUT, getCanvas } from '@/stories/test-utils';

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

/** Bottom sheet open showing CSV and GeoJSON export options */
export const Open: Story = {
  play: async () => {
    const canvas = getCanvas();

    const exportButton = await canvas.findByRole(
      'button',
      { name: 'Export' },
      { timeout: PLAY_TIMEOUT },
    );
    await userEvent.click(exportButton);

    // Assert the Radix Dialog content is present (state-based, not time-based)
    const dialog = await canvas.findByRole(
      'dialog',
      { name: 'Export Observations' },
      {
        timeout: PLAY_TIMEOUT,
      },
    );
    await expect(dialog).toBeVisible();
  },
};
