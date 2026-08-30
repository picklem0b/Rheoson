import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi, type AuthUser } from '@/api/auth.api';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const res = await authApi.login({ email, password });
          set({
            token: res.access_token,
            user: res.user,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      register: async (email, password, displayName) => {
        set({ isLoading: true });
        try {
          const res = await authApi.register({ email, password, display_name: displayName });
          set({
            token: res.access_token,
            user: res.user,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: () => {
        set({ token: null, user: null, isAuthenticated: false });
      },

      initialize: async () => {
        const { token } = get();
        if (!token) return;
        try {
          const user = await authApi.getProfile();
          set({ user, isAuthenticated: true });
        } catch {
          set({ token: null, user: null, isAuthenticated: false });
        }
      },
    }),
    {
      name: 'rheoson-auth',
      partialize: (state) => ({ token: state.token }),
    }
  )
);
