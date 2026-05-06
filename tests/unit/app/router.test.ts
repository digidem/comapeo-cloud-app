import { describe, expect, it } from 'vitest';

import {
  dashboardRoute,
  loginRoute,
  projectsRoute,
  routeTree,
  router,
  settingsRoute,
} from '@/app/router';

describe('router', () => {
  describe('route paths', () => {
    it('has correct route paths', () => {
      // TanStack Router strips leading slash from child route paths
      expect(loginRoute.path).toBe('login');
      expect(dashboardRoute.path).toBe('dashboard');
      expect(projectsRoute.path).toBe('projects');
      expect(settingsRoute.path).toBe('settings');
    });
  });

  describe('route components', () => {
    it('each route path resolves to its component', () => {
      const routes = [
        { path: '/login', route: loginRoute, name: 'Login' },
        { path: '/dashboard', route: dashboardRoute, name: 'Dashboard' },
        { path: '/projects', route: projectsRoute, name: 'Projects' },
        { path: '/settings', route: settingsRoute, name: 'Settings' },
      ];

      for (const { path, route, name } of routes) {
        // Verify the route has a component option
        const component = route.options?.component;
        expect(
          component,
          `route ${path} should have a component`,
        ).toBeDefined();

        // Component function name should contain the screen name
        expect(
          component?.name ?? '',
          `route ${path} component should be ${name}Screen`,
        ).toContain(name);
      }
    });
  });

  describe('router configuration', () => {
    it('router configuration is valid', () => {
      // Router should have the route tree
      expect(router.routeTree).toBeDefined();

      // Root route should be the base of the tree
      expect(routeTree.id).toBe('__root__');

      // All child routes are registered
      const childRoutes = routeTree.children;
      expect(childRoutes).toBeDefined();
      expect(childRoutes!).toHaveLength(4);

      // TanStack Router stores paths without leading slash
      const childPaths = childRoutes!.map((child) => child.path);
      expect(childPaths).toContain('login');
      expect(childPaths).toContain('dashboard');
      expect(childPaths).toContain('projects');
      expect(childPaths).toContain('settings');
    });
  });
});
