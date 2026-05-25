import type { SVGAttributes } from 'react';

interface SpinnerProps extends SVGAttributes<SVGSVGElement> {
  size?: number;
}

function Spinner({ size = 24, className = '', ...rest }: SpinnerProps) {
  return (
    <svg
      role="img"
      aria-label="Loading"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`text-primary motion-safe:animate-spin ${className}`}
      {...rest}
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export { Spinner };
export type { SpinnerProps };
