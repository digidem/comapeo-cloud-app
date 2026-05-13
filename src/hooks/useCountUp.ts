import { useEffect, useRef, useState } from 'react';

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
 * Animates a numeric value from its current display value to the new target.
 * - Re-animates whenever `value` changes (not just on mount).
 * - Animates from the previously displayed number to the new target.
 * - Non-numeric values (e.g. "Connected to Archive") are shown as-is without animation.
 * - Zero values are displayed immediately.
 *
 * @param value - The target value (number or locale-formatted string).
 * @param duration - Animation duration in milliseconds (default 400).
 * @returns The animated display value during animation, or the original value after completion.
 */
export function useCountUp(
  value: string | number,
  duration = 400,
): string | number {
  const [display, setDisplay] = useState<string | number>('0');
  const rafRef = useRef<number | null>(null);
  // Tracks the last numeric value shown on screen (updated every frame)
  const lastNumericRef = useRef<number>(0);

  useEffect(() => {
    const target = parseNumericValue(value);

    // Non-numeric — show immediately without animation
    if (target === null) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- immediate display for non-numeric values, no animation to schedule
      setDisplay(value);
      return;
    }

    // Zero — show immediately without animation
    if (target === 0) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastNumericRef.current = 0;
      setDisplay(value);
      return;
    }

    // Cancel any in-flight animation
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    const numericTarget: number = target;
    // Start from wherever the display currently is (not the old completed target)
    const startValue = lastNumericRef.current;
    const startTime = performance.now();

    function frame(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out quad for smooth deceleration
      const eased = 1 - (1 - progress) * (1 - progress);
      const current = Math.round(
        startValue + (numericTarget - startValue) * eased,
      );

      // Track the current numeric value for smooth re-animation
      lastNumericRef.current = current;
      setDisplay(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        // Show the final formatted value once animation completes
        lastNumericRef.current = numericTarget;
        setDisplay(value);
        rafRef.current = null;
      }
    }

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [value, duration]);

  return display;
}
