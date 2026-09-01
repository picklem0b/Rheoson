import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi, type AuthUser } from '@/api/auth.api';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isGuest: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
  initialize: () => Promise<void>;
  setToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isGuest: true,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const res = await authApi.login({ email, password });
          set({
            token: res.session_token,
            user: res.user,
            isAuthenticated: true,
            isGuest: false,
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
            isGuest: false,
            isLoading: false,
          });
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: () => {
        set({ token: null, user: null, isAuthenticated: false, isGuest: true });
      },

      initialize: async () => {
        const { token } = get();
        if (!token) return;
        try {
          const user = await authApi.getProfile();
          set({ user, isAuthenticated: true, isGuest: false });
        } catch {
          // Token expired or invalid — fall back to guest mode
          set({ token: null, user: null, isAuthenticated: false, isGuest: true });
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
