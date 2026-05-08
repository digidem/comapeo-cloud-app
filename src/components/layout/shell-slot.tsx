import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';

export interface AppShellOverrides {
  topbarWorkspaceName?: string;
  topbarModeLabel?: string;
  topbarActions?: ReactNode;
  secondaryContent?: ReactNode;
}

interface ShellSlotCtx {
  setOverrides: (o: AppShellOverrides) => void;
  overrides: AppShellOverrides;
}

const EMPTY: AppShellOverrides = {};

const ShellSlotContext = createContext<ShellSlotCtx>({
  setOverrides: () => {},
  overrides: EMPTY,
});

export function ShellSlotProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<AppShellOverrides>(EMPTY);
  const ctx = useMemo(() => ({ overrides, setOverrides }), [overrides]);
  return (
    <ShellSlotContext.Provider value={ctx}>
      {children}
    </ShellSlotContext.Provider>
  );
}

export function useShellOverrides() {
  return useContext(ShellSlotContext).overrides;
}

/**
 * Register per-screen AppShell overrides from inside a layout route child.
 * The caller MUST memoize `overrides` with useMemo (and useCallback for handlers)
 * to avoid resetting on every render.
 */
export function useShellSlot(overrides: AppShellOverrides) {
  const { setOverrides } = useContext(ShellSlotContext);
  const clear = useCallback(() => setOverrides(EMPTY), [setOverrides]);
  useEffect(() => {
    setOverrides(overrides);
    return clear;
     
  }, [overrides, setOverrides, clear]);
}
