import * as v from 'valibot';
import { create } from 'zustand';

const STORAGE_KEY = 'comapeo-auth';

const persistedAuthSchema = v.object({
  token: v.union([v.string(), v.null()]),
  baseUrl: v.union([v.string(), v.null()]),
});

type PersistedAuth = v.InferOutput<typeof persistedAuthSchema>;

interface AuthState {
  token: string | null;
  baseUrl: string | null;
  isAuthenticated: boolean;
  setToken: (token: string) => void;
  setBaseUrl: (url: string) => void;
  clearAuth: () => void;
}

function persistToStorage(state: {
  token: string | null;
  baseUrl: string | null;
}): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function rehydrateFromStorage(): PersistedAuth | null {
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  const result = v.safeParse(persistedAuthSchema, JSON.parse(stored));
  return result.success ? result.output : null;
}

function getInitialState(): { token: string | null; baseUrl: string | null } {
  const rehydrated = rehydrateFromStorage();
  if (rehydrated) {
    return { token: rehydrated.token, baseUrl: rehydrated.baseUrl };
  }
  return { token: null, baseUrl: null };
}

const initialState = getInitialState();

export const useAuthStore = create<AuthState>()((set) => ({
  token: initialState.token,
  baseUrl: initialState.baseUrl,
  isAuthenticated: initialState.token !== null,

  setToken: (token: string) =>
    set((state) => {
      const next = { ...state, token, isAuthenticated: true };
      persistToStorage(next);
      return next;
    }),

  setBaseUrl: (url: string) =>
    set((state) => {
      const next = { ...state, baseUrl: url };
      persistToStorage(next);
      return next;
    }),

  clearAuth: () =>
    set(() => {
      sessionStorage.removeItem(STORAGE_KEY);
      return { token: null, baseUrl: null, isAuthenticated: false };
    }),
}));
