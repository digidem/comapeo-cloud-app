/**
 * @storybook/test-runner configuration.
 *
 * Boots the static Storybook server, opens every story in a real browser, and
 * runs:
 *   1. An explicit axe-core accessibility audit via `checkA11y` from
 *      axe-playwright, in OBSERVER-ONLY mode (violations are logged, never
 *      fail the run). The per-story `parameters.a11y.disable` flag is still
 *      honored so individual stories can opt out of the scan.
 *   2. Any `play()` functions on the story (catches broken interactions that
 *      would otherwise silently regress).
 *
 * The addon's `a11y.test` parameter ('todo' | 'error') is intentionally NOT
 * consulted by this runner. That parameter drives the in-browser Storybook UI
 * (and PR #94's Vitest story project); this runner is in observer mode until
 * the rollout flips the global gate to 'error' in a follow-up PR (issue #77).
 * Decoupling avoids cross-talk with per-story `parameters.a11y.test` set in
 * Vitest stories (e.g. `a11y.test: 'error'` on a single story would otherwise
 * flip the whole run to fail-on-violation).
 *
 * Phased rollout
 * --------------
 * The existing Storybook stories had not been audited for a11y when this
 * runner was introduced; this PR turns the check on in observer mode so we
 * can see the violations in CI logs. A follow-up PR will re-enable
 * `skipFailures=false` (and ratchet the addon default to `'error'`) after the
 * existing violations are remediated. See issue #77.
 *
 * Reference: https://storybook.js.org/docs/writing-tests/test-runner
 */
import type { TestRunnerConfig } from '@storybook/test-runner';
import { getStoryContext } from '@storybook/test-runner';
import { checkA11y, injectAxe } from 'axe-playwright';

const config: TestRunnerConfig = {
  async postVisit(page, context) {
    const storyContext = await getStoryContext(page, context);
    const a11yConfig = storyContext.parameters?.a11y;

    // Skip entirely when a11y is disabled for this story
    if (a11yConfig?.disable) return;

    await injectAxe(page);

    await checkA11y(
      page,
      // Use 'body' instead of '#storybook-root' so portaled content from Radix
      // UI components (Dialogs, Sheets) is also audited. These render through
      // portals to document.body, so '#storybook-root' would miss them.
      'body',
      {
        detailedReport: true,
        axeOptions: a11yConfig?.options,
      },
      // skipFailures is driven by the same env var as the addon's a11y.test
      // gate in preview.tsx. When VITE_STORYBOOK_A11Y_ENFORCE='true', the
      // addon sets a11y.test='error' (failing) and the test-runner also
      // enforces violations as failures. When unset or 'false', both gates
      // are in observer-only mode. This keeps the two gates in sync.
      process.env.VITE_STORYBOOK_A11Y_ENFORCE !== 'true',
    );
  },
};

export default config;
