import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi, type AuthUser } from '@/api/auth.api';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** True once mount-time token validation has finished. */
  ready: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
  setToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      ready: false,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const res = await authApi.login({ email, password });
          set({
            token: res.session_token,
            user: res.user,
            isAuthenticated: true,
            ready: true,
            isLoading: false,
          });
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      register: async (email, password, name) => {
        set({ isLoading: true });
        try {
          const res = await authApi.register({ email, password, name });
          set({
            token: res.session_token,
            user: res.user,
            isAuthenticated: true,
            ready: true,
            isLoading: false,
          });
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: async () => {
        const { token } = get();
        // Revoke the Clerk session server-side first — best effort, so a
        // network failure still signs the device out locally.
        if (token) {
          try {
            await authApi.logout();
          } catch {
            /* token may already be dead — drop it locally anyway */
          }
        }
        set({ token: null, user: null, isAuthenticated: false, ready: true });
      },

      initialize: async () => {
        const { token, ready } = get();
        if (ready) return;
        if (!token) {
          // No stored session — nothing to validate. AuthGuard sends the
          // user to /login; guest mode no longer exists.
          set({ ready: true, isAuthenticated: false, user: null });
          return;
        }
        try {
          const user = await authApi.getProfile();
          set({ user, isAuthenticated: true, ready: true });
        } catch {
          // Token expired or invalid — drop it and require sign-in.
          set({ token: null, user: null, isAuthenticated: false, ready: true });
        }
      },

      setToken: (token: string) => {
        set({ token });
      },
    }),
    {
      name: 'rheoson-auth',
      partialize: (state) => ({ token: state.token }),
    }
  )
);
