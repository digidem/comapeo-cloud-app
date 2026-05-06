import * as SwitchPrimitive from '@radix-ui/react-switch';

interface SwitchProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
}

function Switch({
  checked,
  onCheckedChange,
  disabled,
  label,
  id,
}: SwitchProps) {
  return (
    <div className="flex items-center gap-2">
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-border"
      >
        <SwitchPrimitive.Thumb className="pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
      </SwitchPrimitive.Root>
      {label && (
        <label
          htmlFor={id}
          className="text-sm font-medium text-text cursor-pointer"
        >
          {label}
        </label>
      )}
    </div>
  );
}

export { Switch };
export type { SwitchProps };
