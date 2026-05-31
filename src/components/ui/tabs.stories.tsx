import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { Tabs } from '@/components/ui/tabs';

const meta: Meta<typeof Tabs> = {
  title: 'Components/Tabs',
  component: Tabs,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof Tabs>;

/** Default tabs with three tabs, first selected */
export const Default: Story = {
  render: () => (
    <div style={{ width: 400 }}>
      <Tabs defaultValue="tab-1">
        <Tabs.List>
          <Tabs.Trigger value="tab-1">Tab 1</Tabs.Trigger>
          <Tabs.Trigger value="tab-2">Tab 2</Tabs.Trigger>
          <Tabs.Trigger value="tab-3">Tab 3</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="tab-1">Content for Tab 1</Tabs.Content>
        <Tabs.Content value="tab-2">Content for Tab 2</Tabs.Content>
        <Tabs.Content value="tab-3">Content for Tab 3</Tabs.Content>
      </Tabs>
    </div>
  ),
};

/** Second tab selected by default */
export const SecondTabSelected: Story = {
  render: () => (
    <div style={{ width: 400 }}>
      <Tabs defaultValue="tab-2">
        <Tabs.List>
          <Tabs.Trigger value="tab-1">Tab 1</Tabs.Trigger>
          <Tabs.Trigger value="tab-2">Tab 2</Tabs.Trigger>
          <Tabs.Trigger value="tab-3">Tab 3</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="tab-1">Content for Tab 1</Tabs.Content>
        <Tabs.Content value="tab-2">Content for Tab 2</Tabs.Content>
        <Tabs.Content value="tab-3">Content for Tab 3</Tabs.Content>
      </Tabs>
    </div>
  ),
};

/** Tabs with icon prefixes in trigger labels */
export const WithIcons: Story = {
  render: () => (
    <div style={{ width: 400 }}>
      <Tabs defaultValue="data">
        <Tabs.List>
          <Tabs.Trigger value="data">{'\uD83D\uDCCA'} Data</Tabs.Trigger>
          <Tabs.Trigger value="map">{'\uD83D\uDDFA\uFE0F'} Map</Tabs.Trigger>
          <Tabs.Trigger value="alerts">{'\uD83D\uDD14'} Alerts</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="data">Data view content</Tabs.Content>
        <Tabs.Content value="map">Map view content</Tabs.Content>
        <Tabs.Content value="alerts">Alerts view content</Tabs.Content>
      </Tabs>
    </div>
  ),
};
