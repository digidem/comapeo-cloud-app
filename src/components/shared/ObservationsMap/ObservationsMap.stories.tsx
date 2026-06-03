import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { ObservationsMap } from '@/components/shared/ObservationsMap/ObservationsMap';
import type { Observation } from '@/lib/data-layer';

const meta: Meta<typeof ObservationsMap> = {
  title: 'Components/ObservationsMap',
  component: ObservationsMap,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div style={{ padding: 16 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ObservationsMap>;

const noop = () => {};

function makeObservation(
  localId: string,
  lat: number,
  lon: number,
): Observation {
  return {
    localId,
    projectLocalId: 'project-1',
    sourceType: 'local',
    sourceId: localId,
    lat,
    lon,
    tags: {},
    createdAt: '2024-03-15T08:00:00Z',
    updatedAt: '2024-03-15T08:00:00Z',
    dirtyLocal: false,
    deleted: false,
  };
}

const geoObservations: Observation[] = [
  makeObservation('obs-1', -3.1, -60.0),
  makeObservation('obs-2', -3.4, -60.5),
  makeObservation('obs-3', -2.8, -59.6),
];

export const Default: Story = {
  args: {
    observations: geoObservations,
    onMarkerClick: noop,
  },
};

export const Empty: Story = {
  args: {
    observations: [],
    onMarkerClick: noop,
  },
};
