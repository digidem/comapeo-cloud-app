import { defineMessages, useIntl } from 'react-intl';

const messages = defineMessages({
  date: {
    id: 'categories.fieldType.date',
    defaultMessage: 'Date',
  },
  number: {
    id: 'categories.fieldType.number',
    defaultMessage: 'Number',
  },
  unknown: {
    id: 'categories.fieldType.unknown',
    defaultMessage: 'Unknown type',
  },
});

export interface FieldInput {
  docId: string;
  tagKey: string;
  type: string;
  label: string;
  helperText?: string;
  options?: Array<{ label: string; value: string }>;
}

interface FieldViewerProps {
  fields: FieldInput[];
}

function FieldBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-text-muted">
      {children}
    </span>
  );
}

function FieldItem({ field }: { field: FieldInput }) {
  const intl = useIntl();
  return (
    <li aria-label={field.label} className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text">{field.label}</span>
      <span className="text-xs text-text-muted font-mono">{field.tagKey}</span>
      {field.type === 'selectOne' && field.options && (
        <div className="flex flex-wrap gap-1">
          {field.options.map((opt) => (
            <FieldBadge key={opt.value}>{opt.label}</FieldBadge>
          ))}
        </div>
      )}
      {field.type === 'selectMultiple' && field.options && (
        <div className="flex flex-wrap gap-1">
          {field.options.map((opt) => (
            <FieldBadge key={opt.value}>{opt.label}</FieldBadge>
          ))}
        </div>
      )}
      {field.type === 'date' && (
        <FieldBadge>{intl.formatMessage(messages.date)}</FieldBadge>
      )}
      {field.type === 'datetime' && (
        <FieldBadge>{intl.formatMessage(messages.date)}</FieldBadge>
      )}
      {field.type === 'number' && (
        <FieldBadge>{intl.formatMessage(messages.number)}</FieldBadge>
      )}
      {field.type !== 'selectOne' &&
        field.type !== 'selectMultiple' &&
        field.type !== 'date' &&
        field.type !== 'datetime' &&
        field.type !== 'number' &&
        field.type !== 'text' &&
        field.type !== 'textarea' && (
          <FieldBadge>{intl.formatMessage(messages.unknown)}</FieldBadge>
        )}
    </li>
  );
}

function FieldViewer({ fields }: FieldViewerProps) {
  return (
    <ul className="flex flex-col gap-4">
      {fields.map((field) => (
        <FieldItem key={field.docId} field={field} />
      ))}
    </ul>
  );
}

export { FieldViewer };
