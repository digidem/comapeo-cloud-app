import type { SVGProps } from 'react';

interface CloseIconProps extends Omit<
  SVGProps<SVGSVGElement>,
  'width' | 'height' | 'viewBox' | 'fill' | 'xmlns' | 'aria-hidden' | 'children'
> {
  size?: number;
}

function CloseIcon({ size = 20, ...props }: CloseIconProps) {
  return (
    <svg
      {...props}
      width={size}
      height={size}
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M11.78 4.03C12.01 3.81 12.01 3.44 11.78 3.22C11.56 2.99 11.19 2.99 10.97 3.22L7.5 6.69L4.03 3.22C3.81 2.99 3.44 2.99 3.22 3.22C2.99 3.44 2.99 3.81 3.22 4.03L6.69 7.5L3.22 10.97C2.99 11.19 2.99 11.56 3.22 11.78C3.44 12.01 3.81 12.01 4.03 11.78L7.5 8.31L10.97 11.78C11.19 12.01 11.56 12.01 11.78 11.78C12.01 11.56 12.01 11.19 11.78 10.97L8.31 7.5L11.78 4.03Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}

export { CloseIcon };
export type { CloseIconProps };
