/**
 * Mock for @tanstack/react-router in Storybook.
 *
 * Provides no-op implementations of all router hooks and components
 * so screens can render without a real router context.
 */

// Hooks — return safe defaults
export function useNavigate() {
  return async (_opts: unknown) => {
    /* no-op in Storybook */
  };
}

export function useParams(_opts?: unknown) {
  return {};
}

export function useSearch() {
  return {};
}

export function useRouterState() {
  return { location: { pathname: '/', search: {} } };
}

export function useMatch() {
  return {};
}

export function useLoaderData() {
  return {};
}

// Components
export function Link({
  children,
  to,
  ...rest
}: {
  children?: React.ReactNode;
  to?: string;
  className?: string;
  [key: string]: unknown;
}) {
  return (
    <a href={to ?? '#'} {...rest}>
      {children}
    </a>
  );
}

export function Outlet() {
  return null;
}

export function Navigate({ to: _to }: { to: string }) {
  return null;
}

// Router creation stubs (not used in stories but imported by some modules)
export function createRouter(_opts: unknown) {
  return {} as unknown;
}

export function createRoute(_opts: unknown) {
  return {} as unknown;
}

export function createRootRouteWithContext() {
  return (_opts: unknown) => ({});
}

export function createRootRoute(_opts: unknown) {
  return {};
}

export function RouterProvider(_props: unknown) {
  return null;
}

export function createMemoryHistory(_opts?: unknown) {
  return {
    location: { pathname: '/', search: '', hash: '' },
    subscribe: () => () => {},
    push: () => {},
    replace: () => {},
    go: () => {},
    back: () => {},
    forward: () => {},
  };
}
