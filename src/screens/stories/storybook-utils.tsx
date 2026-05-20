/**
 * Storybook utilities for mocking TanStack Router and Zustand stores.
 *
 * Screens use `useNavigate`, `useParams`, `Link` from @tanstack/react-router
 * and Zustand stores (project-store, auth-store). These must be mocked in
 * Storybook because there is no router context.
 */
import type { ReactNode } from 'react';
import { createContext, useMemo } from 'react';

// ---------------------------------------------------------------------------
// TanStack Router mock — provides minimal router context for <Link>,
// useNavigate(), useParams() used inside screen components.
// ---------------------------------------------------------------------------

/** Create a stub router that satisfies the minimum TanStack Router context. */
function createStubRouter(overrides?: { params?: Record<string, string> }) {
  const params = overrides?.params ?? {};

  return {
    // Required by useNavigate
    navigate: async () => {},
    // Required by useParams
    latestLocation: {
      search: {},
      params,
      pathname: '/',
    },
    // Required by <Link> internal context
    context: {},
    state: {},
    // Minimal stub for route tree
    routeTree: {
      children: [] as unknown[],
    },
    // Used internally by Link
    buildLocation: (opts: { to?: string; params?: Record<string, string> }) => {
      const to = opts.to ?? '/';
      const p = opts.params ?? {};
      let path = to;
      for (const [key, value] of Object.entries(p)) {
        path = path.replace(`$${key}`, String(value));
      }
      return { href: path };
    },
  } as unknown;
}

// Stub router context — mirrors TanStack Router's internal context shape.
const RouterContext = createContext<unknown>(null);

export function MockRouterProvider({
  children,
  params,
}: {
  children: ReactNode;
  params?: Record<string, string>;
}) {
  const router = useMemo(() => createStubRouter({ params }), [params]);
  return (
    <RouterContext.Provider value={router}>{children}</RouterContext.Provider>
  );
}
