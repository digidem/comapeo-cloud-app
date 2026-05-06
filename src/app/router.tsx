import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router';

import { DashboardScreen } from '@/screens/DashboardScreen';
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
  component: () => <div>Root</div>,
});

// Route definitions
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginScreen,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: DashboardScreen,
});

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects',
  component: ProjectsScreen,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsScreen,
});

// Route tree
const routeTree = rootRoute.addChildren([
  loginRoute,
  dashboardRoute,
  projectsRoute,
  settingsRoute,
]);

// Router instance
export const router = createRouter({
  routeTree,
  context: {
    auth: { isAuthenticated: false },
  },
});

// Type-safe route aliases for external use
export { loginRoute, dashboardRoute, projectsRoute, settingsRoute };

// Export route tree for testing
export { routeTree };
