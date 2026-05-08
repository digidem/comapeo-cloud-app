import { useState } from 'react';

import { Select } from '@/components/ui/select';
import { PARAM_FIELDS } from '@/lib/area-calculator/config';
import type { CalculationParams, Preset } from '@/lib/area-calculator/types';

interface CalculationSettingsProps {
  presets: Preset[];
  selectedPresetId: string;
  params: CalculationParams;
  onPresetChange: (presetId: string) => void;
  onParamsChange: (params: CalculationParams) => void;
}

function CalculationSettings({
  presets,
  selectedPresetId,
  params,
  onPresetChange,
  onParamsChange,
}: CalculationSettingsProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  function handlePresetChange(presetId: string) {
    onPresetChange(presetId);
    const preset = presets.find((p) => p.id === presetId);
    if (preset) {
      onParamsChange({ ...preset.params });
    }
  }

  function handleParamChange(field: keyof CalculationParams, value: string) {
    const num = parseFloat(value);
    if (Number.isFinite(num)) {
      onParamsChange({ ...params, [field]: num });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label
          className="text-sm font-medium text-text"
          htmlFor="preset-select"
        >
          Preset
        </label>
        <Select value={selectedPresetId} onValueChange={handlePresetChange}>
          {presets.map((preset) => (
            <Select.Item key={preset.id} value={preset.id}>
              {preset.label}
            </Select.Item>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm font-medium text-text-muted hover:text-text cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary w-fit"
          onClick={() => setAdvancedOpen((prev) => !prev)}
          aria-expanded={advancedOpen}
        >
          <svg
            className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-90' : ''}`}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
          Advanced
        </button>

        {advancedOpen && (
          <div className="grid grid-cols-1 gap-3 pl-2">
            {PARAM_FIELDS.map((field) => (
              <div key={field} className="flex flex-col gap-1">
                <label
                  htmlFor={`param-${field}`}
                  className="text-xs font-medium text-text-muted"
                >
                  {field}
                </label>
                <input
                  id={`param-${field}`}
                  type="number"
                  value={params[field]}
                  onChange={(e) => handleParamChange(field, e.target.value)}
                  className="w-full rounded-[12px] border border-border bg-white px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export { CalculationSettings };
export type { CalculationSettingsProps };
