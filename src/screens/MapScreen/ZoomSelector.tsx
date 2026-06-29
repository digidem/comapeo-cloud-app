import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';

import { Input } from '@/components/ui/input';

import { mapMessages } from './messages';

interface ZoomRange {
  minZoom: number;
  maxZoom: number;
}

interface ZoomSelectorProps {
  value: ZoomRange;
  onChange: (value: ZoomRange) => void;
}

function parseZoom(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function ZoomSelector({ value, onChange }: ZoomSelectorProps) {
  const intl = useIntl();
  const [draft, setDraft] = useState({
    minZoom: String(value.minZoom),
    maxZoom: String(value.maxZoom),
  });

  const parsed = useMemo(
    () => ({
      minZoom: parseZoom(draft.minZoom),
      maxZoom: parseZoom(draft.maxZoom),
    }),
    [draft],
  );

  const minError =
    parsed.minZoom === null || parsed.minZoom < 0 || parsed.minZoom > 22
      ? intl.formatMessage(mapMessages.invalidZoom)
      : undefined;
  const maxError =
    parsed.maxZoom === null || parsed.maxZoom < 0 || parsed.maxZoom > 22
      ? intl.formatMessage(mapMessages.invalidZoom)
      : undefined;
  const rangeError =
    parsed.minZoom !== null &&
    parsed.maxZoom !== null &&
    parsed.maxZoom < parsed.minZoom
      ? intl.formatMessage(mapMessages.invalidZoomRange)
      : undefined;

  function updateDraft(key: keyof ZoomRange, nextValue: string) {
    const nextDraft = { ...draft, [key]: nextValue };
    const minZoom = parseZoom(nextDraft.minZoom);
    const maxZoom = parseZoom(nextDraft.maxZoom);

    setDraft(nextDraft);

    if (
      minZoom === null ||
      maxZoom === null ||
      minZoom < 0 ||
      minZoom > 22 ||
      maxZoom < 0 ||
      maxZoom > 22 ||
      maxZoom < minZoom
    ) {
      return;
    }

    onChange({ minZoom, maxZoom });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-text">
        {intl.formatMessage(mapMessages.zoomTitle)}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label={intl.formatMessage(mapMessages.minZoom)}
          type="number"
          min={0}
          max={22}
          step={1}
          value={draft.minZoom}
          onChange={(event) => updateDraft('minZoom', event.target.value)}
          error={minError}
        />
        <Input
          label={intl.formatMessage(mapMessages.maxZoom)}
          type="number"
          min={0}
          max={22}
          step={1}
          value={draft.maxZoom}
          onChange={(event) => updateDraft('maxZoom', event.target.value)}
          error={maxError ?? rangeError}
        />
      </div>
    </section>
  );
}

export type { ZoomRange, ZoomSelectorProps };
