import * as Popover from '@radix-ui/react-popover';

import { useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import type { BasemapId, ImageryBasemap } from '@/lib/schemas/imagery-source';

const messages = defineMessages({
  basemapLabel: {
    id: 'map.basemap.label',
    defaultMessage: 'Basemap',
  },
});

export interface BasemapSwitcherProps {
  value: BasemapId;
  onChange: (id: BasemapId) => void;
  basemaps: ImageryBasemap[];
  className?: string;
}

/** Layer icon — stacked map layers */
function LayerIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M10 2L1 7L10 12L19 7L10 2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M1 12L10 17L19 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BasemapSwitcher({
  value,
  onChange,
  basemaps,
  className,
}: BasemapSwitcherProps) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);

  if (basemaps.length === 0) {
    return null;
  }

  return (
    <div className={className} data-testid="basemap-switcher">
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface-card/90 text-text-muted shadow-card backdrop-blur-sm hover:bg-surface-card hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={intl.formatMessage(messages.basemapLabel)}
            data-testid="basemap-switcher-trigger"
          >
            <LayerIcon />
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            className="z-50 w-56 rounded-card border border-border/20 bg-surface-card/95 p-1 shadow-elevated backdrop-blur-md"
            sideOffset={8}
            align="end"
            aria-label={intl.formatMessage(messages.basemapLabel)}
          >
            <div className="px-2 py-1.5 text-xs font-medium text-text-muted">
              {intl.formatMessage(messages.basemapLabel)}
            </div>
            {basemaps.map((basemap) => (
              <button
                key={basemap.id}
                role="menuitemradio"
                aria-checked={basemap.id === value}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none hover:bg-primary/10 hover:text-primary ${
                  basemap.id === value
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-text'
                }`}
                onClick={() => {
                  onChange(basemap.id as BasemapId);
                  setOpen(false);
                }}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                    basemap.id === value
                      ? 'border-primary bg-primary text-white'
                      : 'border-border'
                  }`}
                >
                  {basemap.id === value && (
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <circle cx="5" cy="5" r="3" />
                    </svg>
                  )}
                </span>
                {basemap.name}
              </button>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

export { BasemapSwitcher };
