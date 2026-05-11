import * as SelectPrimitive from '@radix-ui/react-select';

import { type ReactNode } from 'react';

interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  children: ReactNode;
}

interface SelectItemProps {
  value: string;
  children: ReactNode;
  disabled?: boolean;
}

function SelectRoot({
  value,
  onValueChange,
  placeholder,
  disabled,
  children,
}: SelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        disabled={disabled}
        className="inline-flex items-center justify-between rounded-btn border border-border bg-white px-3 py-2 min-h-[44px] text-sm text-text data-[placeholder]:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed w-full"
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <svg
            className="h-4 w-4 text-text-muted"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 rounded-btn border border-border bg-surface-card shadow-dropdown overflow-hidden"
        >
          <SelectPrimitive.Viewport className="p-1">
            {children}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

function SelectItem({ value, children, disabled }: SelectItemProps) {
  return (
    <SelectPrimitive.Item
      value={value}
      disabled={disabled}
      className="relative flex items-center rounded-lg px-3 py-2 text-sm text-text cursor-pointer outline-none data-[highlighted]:bg-primary/10 data-[highlighted]:text-primary data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed"
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

const Select = Object.assign(SelectRoot, {
  Item: SelectItem,
});

export { Select };
export type { SelectProps };
