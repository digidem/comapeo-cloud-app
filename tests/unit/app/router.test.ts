import { describe, expect, it } from 'vitest';

import {
  dashboardRoute,
  homeRoute,
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
      expect(homeRoute.path).toBe('/');
      expect(loginRoute.path).toBe('login');
      expect(dashboardRoute.path).toBe('dashboard');
      expect(projectsRoute.path).toBe('projects');
      expect(settingsRoute.path).toBe('settings');
    });
  });

  describe('route components', () => {
    it('each route path resolves to its component', () => {
      const routes = [
        { path: '/', route: homeRoute, name: 'Home' },
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
      expect(childRoutes!).toHaveLength(5);

      // TanStack Router stores paths without leading slash (except '/')
      const childPaths = childRoutes!.map((child) => child.path);
      expect(childPaths).toContain('/');
      expect(childPaths).toContain('login');
      expect(childPaths).toContain('dashboard');
      expect(childPaths).toContain('projects');
      expect(childPaths).toContain('settings');
    });
  });

  describe('local mode access', () => {
    it('home is reachable without auth redirect', () => {
      expect(homeRoute.options.beforeLoad).toBeUndefined();
    });

    it('dashboard is reachable without auth redirect', () => {
      // No beforeLoad guard on dashboard route — local mode works immediately
      expect(dashboardRoute.options.beforeLoad).toBeUndefined();
    });

    it('projects is reachable without auth redirect', () => {
      expect(projectsRoute.options.beforeLoad).toBeUndefined();
    });

    it('settings is reachable without auth redirect', () => {
      expect(settingsRoute.options.beforeLoad).toBeUndefined();
    });

    it('login route does not gate access to other routes', () => {
      // Login route is just another route — no redirect logic
      expect(loginRoute.options.beforeLoad).toBeUndefined();
      // Login is a flat sibling route, not a parent guard
      expect(loginRoute.path).toBe('login');
    });
  });
});
