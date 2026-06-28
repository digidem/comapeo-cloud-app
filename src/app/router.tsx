import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router';

import { AuthenticatedLayout } from '@/components/layout/authenticated-layout';
import { AlertDetailScreen } from '@/screens/AlertDetailScreen';
import { AlertsScreen } from '@/screens/AlertsScreen';
import { CreateAlertScreen } from '@/screens/CreateAlertScreen';
import { DataScreen } from '@/screens/DataScreen';
import { HomeScreen } from '@/screens/Home/HomeScreen';
import { InviteScreen } from '@/screens/InviteScreen';
import { LoginScreen } from '@/screens/LoginScreen';
import { NotFoundScreen } from '@/screens/NotFoundScreen';
import { ObservationDetailScreen } from '@/screens/ObservationDetailScreen';
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
  notFoundComponent: NotFoundScreen,
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

const dataRoute = createRoute({
  getParentRoute: () => _authenticatedRoute,
  path: '/data',
  component: DataScreen,
});

const observationDetailRoute = createRoute({
  getParentRoute: () => _authenticatedRoute,
  path: '/data/observations/$observationId',
  component: ObservationDetailScreen,
});

const createAlertRoute = createRoute({
  getParentRoute: () => _authenticatedRoute,
  path: '/alerts/new',
  component: CreateAlertScreen,
});

const alertDetailRoute = createRoute({
  getParentRoute: () => _authenticatedRoute,
  path: '/alerts/$alertId',
  component: AlertDetailScreen,
});

const alertsRoute = createRoute({
  getParentRoute: () => _authenticatedRoute,
  path: '/alerts',
  component: AlertsScreen,
});

const settingsRoute = createRoute({
  getParentRoute: () => _authenticatedRoute,
  path: '/settings',
  component: SettingsScreen,
});

const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invite',
  component: InviteScreen,
});

// Route tree
const routeTree = rootRoute.addChildren([
  loginRoute,
  inviteRoute,
  _authenticatedRoute.addChildren([
    homeRoute,
    dataRoute,
    alertsRoute,
    observationDetailRoute,
    createAlertRoute,
    alertDetailRoute,
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
  inviteRoute,
  dataRoute,
  alertsRoute,
  observationDetailRoute,
  createAlertRoute,
  alertDetailRoute,
  settingsRoute,
};

// Export route tree for testing
export { routeTree };
