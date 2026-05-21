/**
 * Mock Zustand stores for Storybook.
 *
 * Screens import these stores directly. In Storybook we want to control
 * their state via story args/parameters.
 */
import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Project store mock
// ---------------------------------------------------------------------------

interface ProjectStoreState {
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
}

export const useProjectStore = create<ProjectStoreState>()((set) => ({
  selectedProjectId: null,
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),
}));

// ---------------------------------------------------------------------------
// Auth store mock
// ---------------------------------------------------------------------------

interface AuthStoreState {
  isAuthenticated: boolean;
  servers: Array<{
    serverId: string;
    label: string;
    baseUrl: string;
    token: string;
  }>;
  addServer: (server: {
    label: string;
    baseUrl: string;
    token: string;
  }) => Promise<string>;
}

export const useAuthStore = create<AuthStoreState>()((set) => ({
  isAuthenticated: true,
  servers: [],
  addServer: async (server) => {
    const id = `server-${Date.now()}`;
    set((state) => ({
      servers: [...state.servers, { ...server, serverId: id }],
    }));
    return id;
  },
}));

