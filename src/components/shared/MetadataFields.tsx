import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import type { MetadataRow, MetadataValueType } from '@/lib/alert-form-utils';

const messages = defineMessages({
  title: {
    id: 'alerts.create.metadataFields',
    defaultMessage: 'Metadata fields',
  },
  add: { id: 'alerts.create.metadataAdd', defaultMessage: 'Add field' },
  remove: { id: 'alerts.create.metadataRemove', defaultMessage: 'Remove' },
  name: { id: 'alerts.create.metadataName', defaultMessage: 'Field name' },
  value: { id: 'alerts.create.metadataValue', defaultMessage: 'Value' },
  type: { id: 'alerts.create.metadataType', defaultMessage: 'Value type' },
  text: { id: 'alerts.create.metadataText', defaultMessage: 'Text' },
  number: { id: 'alerts.create.metadataNumber', defaultMessage: 'Number' },
  date: { id: 'alerts.create.metadataDate', defaultMessage: 'Date' },
  boolean: { id: 'alerts.create.metadataBoolean', defaultMessage: 'Boolean' },
  true: { id: 'alerts.create.metadataTrue', defaultMessage: 'True' },
  false: { id: 'alerts.create.metadataFalse', defaultMessage: 'False' },
});

function inputType(type: MetadataValueType): 'text' | 'number' | 'date' {
  if (type === 'number') return 'number';
  if (type === 'date') return 'date';
  return 'text';
}

export function MetadataFields({
  rows,
  onChange,
  errors,
}: {
  rows: MetadataRow[];
  onChange: (rows: MetadataRow[]) => void;
  errors?: Record<string, string>;
}) {
  const intl = useIntl();
  function update(id: string, patch: Partial<MetadataRow>) {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-text">
          {intl.formatMessage(messages.title)}
        </h2>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            onChange([
              ...rows,
              { id: crypto.randomUUID(), key: '', value: '', type: 'text' },
            ])
          }
        >
          {intl.formatMessage(messages.add)}
        </Button>
      </div>
      {rows.map((row) => (
        <div
          key={row.id}
          className="grid gap-2 rounded-card bg-surface-subtle p-3 md:grid-cols-[1fr_150px_1fr_auto]"
        >
          <input
            aria-label={intl.formatMessage(messages.name)}
            value={row.key}
            onChange={(e) => update(row.id, { key: e.target.value })}
            className="rounded-input border border-border bg-surface-card px-3 py-2 text-sm"
          />
          <select
            aria-label={intl.formatMessage(messages.type)}
            value={row.type}
            onChange={(e) =>
              update(row.id, {
                type: e.target.value as MetadataValueType,
                value: e.target.value === 'boolean' ? 'true' : row.value,
              })
            }
            className="rounded-input border border-border bg-surface-card px-3 py-2 text-sm"
          >
            <option value="text">{intl.formatMessage(messages.text)}</option>
            <option value="number">
              {intl.formatMessage(messages.number)}
            </option>
            <option value="date">{intl.formatMessage(messages.date)}</option>
            <option value="boolean">
              {intl.formatMessage(messages.boolean)}
            </option>
          </select>
          {row.type === 'boolean' ? (
            <select
              aria-label={intl.formatMessage(messages.value)}
              value={row.value || 'true'}
              onChange={(e) => update(row.id, { value: e.target.value })}
              className="rounded-input border border-border bg-surface-card px-3 py-2 text-sm"
            >
              <option value="true">{intl.formatMessage(messages.true)}</option>
              <option value="false">
                {intl.formatMessage(messages.false)}
              </option>
            </select>
          ) : (
            <input
              aria-label={intl.formatMessage(messages.value)}
              type={inputType(row.type)}
              value={row.value}
              onChange={(e) => update(row.id, { value: e.target.value })}
              className="rounded-input border border-border bg-surface-card px-3 py-2 text-sm"
            />
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={() => onChange(rows.filter((item) => item.id !== row.id))}
          >
            {intl.formatMessage(messages.remove)}
          </Button>
          {errors?.[row.id] && (
            <p role="alert" className="text-sm text-error md:col-span-4">
              {errors[row.id]}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
