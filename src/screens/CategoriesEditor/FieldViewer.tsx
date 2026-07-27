import { defineMessages, useIntl } from 'react-intl';

import type { NormalizedField } from '@/lib/fields/normalize';

const messages = defineMessages({
  fieldUnavailable: {
    id: 'categories.fieldUnavailable',
    defaultMessage: 'Field unavailable',
  },
  selectOne: {
    id: 'categories.fieldType.selectOne',
    defaultMessage: 'Select one',
  },
  selectMultiple: {
    id: 'categories.fieldType.selectMultiple',
    defaultMessage: 'Select multiple',
  },
  text: {
    id: 'categories.fieldType.text',
    defaultMessage: 'Text',
  },
  textarea: {
    id: 'categories.fieldType.textarea',
    defaultMessage: 'Long text',
  },
  number: {
    id: 'categories.fieldType.number',
    defaultMessage: 'Number',
  },
  date: {
    id: 'categories.fieldType.date',
    defaultMessage: 'Date',
  },
  datetime: {
    id: 'categories.fieldType.datetime',
    defaultMessage: 'Date and time',
  },
});

function FieldBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-text-muted">
      {children}
    </span>
  );
}

function FieldItem({ field }: { field: NormalizedField }) {
  const intl = useIntl();

  const label = field.label || intl.formatMessage(messages.fieldUnavailable);

  const typeLabel = (() => {
    switch (field.type) {
      case 'selectOne':
        return intl.formatMessage(messages.selectOne);
      case 'selectMultiple':
        return intl.formatMessage(messages.selectMultiple);
      case 'text':
        return intl.formatMessage(messages.text);
      case 'textarea':
        return intl.formatMessage(messages.textarea);
      case 'number':
        return intl.formatMessage(messages.number);
      case 'date':
        return intl.formatMessage(messages.date);
      case 'datetime':
        return intl.formatMessage(messages.datetime);
      default:
        return intl.formatMessage(messages.fieldUnavailable);
    }
  })();

  const showOptions =
    field.type === 'selectOne' || field.type === 'selectMultiple';
  const showTypeBadge = !showOptions;

  return (
    <li aria-label={label} className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text">{label}</span>
      {field.helperText && (
        <span className="text-sm text-text-muted">{field.helperText}</span>
      )}
      {field.placeholder && (
        <span className="text-xs text-text-muted/70">{field.placeholder}</span>
      )}
      {showOptions && field.options && (
        <div className="flex flex-wrap gap-1">
          {field.options.map((opt) => (
            <FieldBadge key={opt.value}>{opt.label}</FieldBadge>
          ))}
        </div>
      )}
      {showTypeBadge && <FieldBadge>{typeLabel}</FieldBadge>}
    </li>
  );
}

interface FieldViewerProps {
  fields: NormalizedField[];
}

function FieldViewer({ fields }: FieldViewerProps) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col gap-4">
      {fields.map((field) => (
        <FieldItem key={field.docId} field={field} />
      ))}
    </ul>
  );
}

export { FieldViewer };
export type { FieldViewerProps };
