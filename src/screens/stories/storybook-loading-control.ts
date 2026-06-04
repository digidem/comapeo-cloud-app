/**
 * Storybook-only state control.
 *
 * The Storybook mock hooks resolve their queries immediately, so screens
 * never enter their `isPending` branch (loading skeletons can't be reviewed
 * visually) and never enter their `isError` branch (error states can't be
 * reviewed). This tiny store lets a story flip the mock data hooks into
 * pending / error / empty states on demand.
 *
 * It lives under `src/` (not `__mocks__/`) on purpose: both the mock hook
 * (relative import) and the story (`@/` import) must resolve to the SAME
 * real module in both tsc (tsconfig `paths`) and Storybook (Vite aliases).
 * It is only ever imported by Storybook artifacts, never by production code.
 */
import { create } from 'zustand';

export type StorybookDataMode = 'normal' | 'loading' | 'error' | 'empty';

interface StorybookLoadingState {
  /**
   * The mock data mode the screens should render. Read by the mock hooks
   * (see src/screens/stories/__mocks__/hooks.ts) to decide what to return
   * for the current query.
   *
   * Controls useObservations and useAlerts.
   */
  dataMode: StorybookDataMode;
  /**
   * Separate mode for useProjects so that error / empty data-list stories
   * still have a valid project in the store.  Defaults to 'normal'.
   */
  projectDataMode: StorybookDataMode;
}

export const useStorybookDataStore = create<StorybookLoadingState>()(() => ({
  dataMode: 'normal',
  projectDataMode: 'normal',
}));

/**
 * @deprecated retained for backward compatibility with #93. New code should
 * use `useStorybookDataStore` and read/write `dataMode`.
 */
export const useStorybookLoadingStore = useStorybookDataStore;
