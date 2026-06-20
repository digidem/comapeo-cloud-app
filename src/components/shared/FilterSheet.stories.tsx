import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { userEvent, within } from 'storybook/test';

import { useState } from 'react';

import { FilterSheet } from '@/components/shared/FilterSheet';
import type { ObservationFilterBarProps } from '@/components/shared/ObservationFilterBar';
import { DEFAULT_FILTERS } from '@/lib/observation-filters';

const meta: Meta<typeof FilterSheet> = {
  title: 'Components/FilterSheet',
  component: FilterSheet,
  parameters: {
    layout: 'fullscreen',
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

export default meta;
type Story = StoryObj<typeof FilterSheet>;

const noop = () => {};

const defaultFilterProps: ObservationFilterBarProps = {
  filters: DEFAULT_FILTERS,
  availableCategories: [],
  resultCount: 0,
  isFiltering: false,
  onSearchChange: noop,
  onStartDateChange: noop,
  onEndDateChange: noop,
  onCategoryToggle: noop,
  onCategoriesClear: noop,
  onSortChange: noop,
  onClear: noop,
};

function FilterSheetDemo({
  initialOpen = false,
  filterProps = {},
}: {
  initialOpen?: boolean;
  filterProps?: Partial<ObservationFilterBarProps>;
}) {
  const [open, setOpen] = useState(initialOpen);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F4F6FA',
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <div style={{ padding: '16px', width: '100%' }}>
        <p style={{ color: '#172033', fontSize: 14, marginBottom: 12 }}>
          Tap the button below to open the filter sheet.
        </p>
        <button
          type="button"
          data-testid="filter-trigger"
          onClick={() => setOpen(true)}
          style={{
            padding: '8px 16px',
            borderRadius: 12,
            background: '#1F6FFF',
            color: '#fff',
            border: 'none',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Open Filters
        </button>
      </div>
      <FilterSheet
        open={open}
        onOpenChange={setOpen}
        {...defaultFilterProps}
        {...filterProps}
      />
    </div>
  );
}

export const Closed: Story = {
  render: () => <FilterSheetDemo initialOpen={false} />,
};

export const Open: Story = {
  render: () => <FilterSheetDemo initialOpen={false} />,
  play: async () => {
    const canvas = within(document.body);
    const trigger = await canvas.findByTestId('filter-trigger', undefined, {
      timeout: 5_000,
    });
    await userEvent.click(trigger);
  },
};

export const WithCategorySelected: Story = {
  render: () => (
    <FilterSheetDemo
      initialOpen={true}
      filterProps={{
        filters: {
          ...DEFAULT_FILTERS,
          categories: ['Water Quality'],
        },
        availableCategories: ['Water Quality', 'Wildlife', 'Forest Cover'],
        resultCount: 15,
        isFiltering: true,
      }}
    />
  ),
};
