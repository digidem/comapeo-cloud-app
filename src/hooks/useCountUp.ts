import { useEffect, useState } from 'react';

/**
 * Parse a string or number to its numeric value.
 * Returns null if the value is not numeric.
 */
function parseNumericValue(value: string | number): number | null {
  if (typeof value === 'number') return value;
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Animates a numeric value from 0 to its final value over `duration` ms.
 * - Only fires once on initial mount — subsequent prop changes are ignored.
 * - Non-numeric values (e.g. "Connected to Archive") are shown as-is without animation.
 * - Zero values are displayed immediately.
 *
 * @param value - The target value (number or locale-formatted string).
 * @param duration - Animation duration in milliseconds (default 400).
 * @returns The animated display value during animation, or the original value after completion.
 */
export function useCountUp(value: string | number, duration = 400): string | number {
  const [display, setDisplay] = useState<string | number>('0');

  useEffect(() => {
    const target = parseNumericValue(value);

    // Non-numeric or zero — show immediately without animation
    if (target === null || target === 0) {
      setDisplay(value);
      return;
    }

    const numericTarget: number = target;
    const startTime = performance.now();

    function frame(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out quad for smooth deceleration
      const eased = 1 - (1 - progress) * (1 - progress);
      const current = Math.round(numericTarget * eased);

      setDisplay(current);

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        // Show the final formatted value once animation completes
        setDisplay(value);
      }
    }

    requestAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return display;
}
