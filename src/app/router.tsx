import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router';

import { AuthenticatedLayout } from '@/components/layout/authenticated-layout';
import { DashboardScreen } from '@/screens/DashboardScreen';
import { HomeScreen } from '@/screens/Home/HomeScreen';
import { LoginScreen } from '@/screens/LoginScreen';
import { ProjectsScreen } from '@/screens/ProjectsScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';

// Context type for future auth integration
interface RouterContext {
  auth: {
    isAuthenticated: boolean;
  };
}

// Root route
const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});

// Layout route — wraps all authenticated screens with AppShell
const _authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_authenticated',
  component: AuthenticatedLayout,
});

// Route definitions
const homeRoute = createRoute({
  getParentRoute: () => _authenticatedRoute,
  path: '/',
  component: HomeScreen,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginScreen,
});

const dashboardRoute = createRoute({
  getParentRoute: () => _authenticatedRoute,
  path: '/dashboard',
  component: DashboardScreen,
});

const projectsRoute = createRoute({
  getParentRoute: () => _authenticatedRoute,
  path: '/projects',
  component: ProjectsScreen,
});

const settingsRoute = createRoute({
  getParentRoute: () => _authenticatedRoute,
  path: '/settings',
  component: SettingsScreen,
});

// Route tree
const routeTree = rootRoute.addChildren([
  loginRoute,
  _authenticatedRoute.addChildren([
    homeRoute,
    dashboardRoute,
    projectsRoute,
    settingsRoute,
  ]),
]);

// Router instance
export const router = createRouter({
  routeTree,
  context: {
    auth: { isAuthenticated: false },
  },
});

// Type-safe route aliases for external use
export {
  _authenticatedRoute,
  homeRoute,
  loginRoute,
  dashboardRoute,
  projectsRoute,
  settingsRoute,
};

// Export route tree for testing
export { routeTree };
