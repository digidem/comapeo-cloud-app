import { within } from 'storybook/test';

/** Query scope for portal-rendered content (Radix Dialog/Sheet render to document.body). */
export function getCanvas() {
  return within(document.body);
}

/** Default timeout for play() assertions - allows time for async rendering. */
export const PLAY_TIMEOUT = 5_000;
