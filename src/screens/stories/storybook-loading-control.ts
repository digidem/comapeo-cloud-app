/**
 * Storybook-only loading control.
 *
 * The Storybook mock hooks resolve their queries immediately, so screens never
 * enter their `isPending` branch and loading skeletons can't be reviewed
 * visually. This tiny store lets a story flip the mock `useProjects` hook into a
 * pending state on demand (see issue #86).
 *
 * It lives under `src/` (not `__mocks__/`) on purpose: both the mock hook
 * (relative import) and the story (`@/` import) must resolve to the SAME real
 * module in both tsc (tsconfig `paths`) and Storybook (Vite aliases). It is only
 * ever imported by Storybook artifacts, never by production code.
 */
import { create } from 'zustand';

interface StorybookLoadingState {
  /** When true, the mock `useProjects` hook stays in its pending state. */
  projectsPending: boolean;
  setProjectsPending: (pending: boolean) => void;
}

export const useStorybookLoadingStore = create<StorybookLoadingState>()(
  (set) => ({
    projectsPending: false,
    setProjectsPending: (projectsPending) => set({ projectsPending }),
  }),
);
