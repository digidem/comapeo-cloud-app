import { describe, expect, it } from 'vitest';

import {
  _authenticatedRoute,
  dashboardRoute,
  homeRoute,
  inviteRoute,
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
      expect(inviteRoute.path).toBe('invite');
      expect(dashboardRoute.path).toBe('dashboard');
      expect(projectsRoute.path).toBe('projects');
      expect(settingsRoute.path).toBe('settings');
      // Layout route uses id instead of path; TanStack Router prefixes with parent path
      expect(_authenticatedRoute.id).toBe('/_authenticated');
    });
  });

  describe('route components', () => {
    it('each route path resolves to its component', () => {
      const routes = [
        { path: '/', route: homeRoute, name: 'Home' },
        { path: '/login', route: loginRoute, name: 'Login' },
        { path: '/invite', route: inviteRoute, name: 'Invite' },
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

      // Root has three direct children: loginRoute + inviteRoute + _authenticatedRoute (layout)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const childRoutes = routeTree.children as unknown as any[];
      expect(childRoutes).toBeDefined();
      expect(childRoutes).toHaveLength(3);

      const rootChildIds = childRoutes.map((child) => child.id);
      expect(rootChildIds).toContain('/_authenticated');
      expect(rootChildIds).toContain('/invite');

      // Authenticated screens live under the layout route
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const authChildren = _authenticatedRoute.children as unknown as any[];
      expect(authChildren).toBeDefined();
      const authPaths = authChildren.map(
        (child: { path: string }) => child.path,
      );
      expect(authPaths).toContain('/');
      expect(authPaths).toContain('dashboard');
      expect(authPaths).toContain('projects');
      expect(authPaths).toContain('settings');

      // Login stays at root (no shell)
      const loginChild = childRoutes.find(
        (c: { path?: string }) => c.path === 'login',
      );
      expect(loginChild).toBeDefined();
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
