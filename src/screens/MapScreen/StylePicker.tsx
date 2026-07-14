import { useState } from 'react';
import { useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BASEMAP_CATALOG } from '@/lib/map/basemaps';
import type { ImageryBasemap } from '@/lib/schemas/imagery-source';

import { mapMessages } from './messages';

type PickerMode = 'presets' | 'custom';
type CustomType = 'raster' | 'style';
type RasterScheme = 'xyz' | 'tms';

interface StylePickerProps {
  value: ImageryBasemap;
  onChange: (basemap: ImageryBasemap) => void;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function StylePicker({ value, onChange }: StylePickerProps) {
  const intl = useIntl();
  const [mode, setMode] = useState<PickerMode>('presets');
  const [customUrl, setCustomUrl] = useState('');
  const [customType, setCustomType] = useState<CustomType>('style');
  const [scheme, setScheme] = useState<RasterScheme>('xyz');
  const [error, setError] = useState<string | null>(null);

  function handleUseCustomUrl() {
    const trimmedUrl = customUrl.trim();
    if (!isHttpUrl(trimmedUrl)) {
      setError(intl.formatMessage(mapMessages.invalidUrl));
      return;
    }

    setError(null);
    onChange({
      id: 'custom',
      name: intl.formatMessage(mapMessages.customMode),
      category: 'street',
      type: customType,
      url: trimmedUrl,
      ...(customType === 'raster' ? { scheme } : {}),
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-text">
          {intl.formatMessage(mapMessages.stylePickerTitle)}
        </h2>
        <div className="grid grid-cols-2 rounded-btn bg-surface p-1 text-xs font-semibold text-text-muted">
          <button
            type="button"
            aria-pressed={mode === 'presets'}
            className={`rounded-btn px-3 py-1.5 ${
              mode === 'presets'
                ? 'bg-surface-card text-primary shadow-card'
                : 'hover:text-text'
            }`}
            onClick={() => setMode('presets')}
          >
            {intl.formatMessage(mapMessages.presetsMode)}
          </button>
          <button
            type="button"
            aria-pressed={mode === 'custom'}
            className={`rounded-btn px-3 py-1.5 ${
              mode === 'custom'
                ? 'bg-surface-card text-primary shadow-card'
                : 'hover:text-text'
            }`}
            onClick={() => setMode('custom')}
          >
            {intl.formatMessage(mapMessages.customMode)}
          </button>
        </div>
      </div>

      {mode === 'presets' ? (
        <div className="grid grid-cols-1 gap-2">
          {BASEMAP_CATALOG.map((basemap) => {
            const isSelected = basemap.id === value.id;
            return (
              <button
                key={basemap.id}
                type="button"
                aria-label={basemap.name}
                aria-pressed={isSelected}
                className={`rounded-btn px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  isSelected
                    ? 'bg-primary-soft text-primary'
                    : 'bg-surface hover:bg-primary-soft/60 text-text'
                }`}
                onClick={() => onChange(basemap)}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{basemap.name}</span>
                  {isSelected ? (
                    <span className="rounded-full bg-surface-card px-2 py-0.5 text-xs font-semibold">
                      {intl.formatMessage(mapMessages.selectedStyle)}
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-xs capitalize text-text-muted">
                  {basemap.category}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <form
          className="flex flex-col gap-3 rounded-card bg-surface p-3"
          onSubmit={(event) => {
            event.preventDefault();
            handleUseCustomUrl();
          }}
        >
          <Input
            label={intl.formatMessage(mapMessages.customUrlLabel)}
            value={customUrl}
            onChange={(event) => {
              setCustomUrl(event.target.value);
              setError(null);
            }}
            placeholder={intl.formatMessage(mapMessages.customUrlPlaceholder, {
              z: '{z}',
              x: '{x}',
              y: '{y}',
            })}
            error={error ?? undefined}
          />

          <label className="flex flex-col gap-1 text-sm font-medium text-text">
            {intl.formatMessage(mapMessages.mapTypeLabel)}
            <select
              className="min-h-[44px] rounded-input border border-border bg-surface-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              value={customType}
              onChange={(event) =>
                setCustomType(event.target.value as CustomType)
              }
            >
              <option value="style">
                {intl.formatMessage(mapMessages.typeStyle)}
              </option>
              <option value="raster">
                {intl.formatMessage(mapMessages.typeRaster)}
              </option>
            </select>
          </label>

          {customType === 'raster' ? (
            <label className="flex flex-col gap-1 text-sm font-medium text-text">
              {intl.formatMessage(mapMessages.schemeLabel)}
              <select
                className="min-h-[44px] rounded-input border border-border bg-surface-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                value={scheme}
                onChange={(event) =>
                  setScheme(event.target.value as RasterScheme)
                }
              >
                <option value="xyz">
                  {intl.formatMessage(mapMessages.schemeXyz)}
                </option>
                <option value="tms">
                  {intl.formatMessage(mapMessages.schemeTms)}
                </option>
              </select>
            </label>
          ) : null}

          <Button onClick={handleUseCustomUrl} className="w-full">
            {intl.formatMessage(mapMessages.useCustomUrl)}
          </Button>
        </form>
      )}
    </section>
  );
}

export type { StylePickerProps };
