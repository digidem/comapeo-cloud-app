import { type InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  label: string;
  error?: string;
  type?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, type = 'text', className = '', id, ...rest },
  ref,
) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-text">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        type={type}
        className={`w-full rounded-input border border-border bg-surface-card px-3 py-2 min-h-[44px] text-sm text-text placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary disabled:opacity-50 disabled:cursor-not-allowed ${error ? 'border-error focus-visible:ring-error focus-visible:border-error' : ''} ${className}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        {...rest}
      />
      {error && (
        <p id={`${inputId}-error`} className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
});

export { Input };
export type { InputProps };
