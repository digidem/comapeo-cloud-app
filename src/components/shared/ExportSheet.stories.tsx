import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { useState } from 'react';

import { ExportSheet } from '@/components/shared/ExportSheet';

const meta: Meta<typeof ExportSheet> = {
  title: 'Components/ExportSheet',
  component: ExportSheet,
  parameters: {
    layout: 'fullscreen',
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

export default meta;
type Story = StoryObj<typeof ExportSheet>;

function ExportSheetDemo() {
  const [open, setOpen] = useState(true);

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
          The export sheet is open below — tap the backdrop or ✕ to close.
        </p>
        <button
          type="button"
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
          Open Export Sheet
        </button>
      </div>
      <ExportSheet
        open={open}
        onOpenChange={setOpen}
        onExportGeoJson={() => console.log('export geojson')}
        onExportCsv={() => console.log('export csv')}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <ExportSheetDemo />,
};
