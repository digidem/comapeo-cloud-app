import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { useState } from 'react';

import { ArchiveOverflowSheet } from '@/components/shared/ArchiveOverflowSheet';

const meta: Meta<typeof ArchiveOverflowSheet> = {
  title: 'Components/ArchiveOverflowSheet',
  component: ArchiveOverflowSheet,
  parameters: {
    layout: 'fullscreen',
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

export default meta;
type Story = StoryObj<typeof ArchiveOverflowSheet>;

function OverflowSheetDemo({
  archiveName = 'Amazon Archive',
}: {
  archiveName?: string;
}) {
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
          The overflow sheet is open below — tap the backdrop or ✕ to close.
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
          Open ⋯ Overflow Sheet
        </button>
      </div>
      <ArchiveOverflowSheet
        open={open}
        onOpenChange={setOpen}
        archiveName={archiveName}
        onViewDetails={() => console.log('view details')}
        onEdit={() => console.log('edit')}
        onSync={() => console.log('sync')}
        onCopyUrl={() => console.log('copy url')}
        onRemove={() => console.log('remove')}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <OverflowSheetDemo />,
};

export const LongName: Story = {
  render: () => (
    <OverflowSheetDemo archiveName="Fundação Nacional do Índio — Amazonia Archive" />
  ),
};
