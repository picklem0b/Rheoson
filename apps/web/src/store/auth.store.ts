import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi, type AuthUser } from '@/api/auth.api';
import { CLERK_PUBLISHABLE_KEY } from '@/lib/constants';
import { setAuthState } from '@/lib/authGate';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** True once mount-time token validation has finished. */
  ready: boolean;
  /**
   * True once we KNOW whether this visitor is signed in (Clerk finished
   * loading). Until then `hintSignedIn` — remembered from last time — lets
   * the first paint pick the right screen without waiting on the network.
   */
  resolved: boolean;
  hintSignedIn: boolean;
  isLoading: boolean;
  /** Sync Clerk user data into local store (called from ClerkUserSync). */      syncClerkUser: (clerkUser: { id: string; email?: string; username?: string; imageUrl?: string; createdAt?: string } | null) => void;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
  setToken: (token: string) => void;
}

const clerkEnabled = !!CLERK_PUBLISHABLE_KEY;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      ready: false,
      resolved: false,
      hintSignedIn: false,
      isLoading: false,

      syncClerkUser: (clerkUser) => {
        if (!clerkUser) {
          setAuthState(true, false);
          set({ user: null, isAuthenticated: false, ready: true, resolved: true, hintSignedIn: false });
          return;
        }
        setAuthState(true, true);
        set({
          user: {
            id: clerkUser.id,
            email: clerkUser.email ?? '',
            username: clerkUser.username ?? clerkUser.email ?? 'User',
            image_url: clerkUser.imageUrl,
            created_at: clerkUser.createdAt,
          },
          isAuthenticated: true,
          ready: true,
          resolved: true,
          hintSignedIn: true,
        });
      },

      logout: async () => {
        // Clerk handles its own sign-out via useAuth().signOut()
        // This is called after Clerk sign-out to clear local state.
        setAuthState(true, false);
        set({ token: null, user: null, isAuthenticated: false, ready: true, resolved: true, hintSignedIn: false });
      },

      initialize: async () => {
        if (clerkEnabled) {
          // Clerk manages auth state — the store starts unauthenticated
          // and gets populated by the ClerkUserSync component.
          set({ ready: true });
          return;
        }

        // Fallback: validate stored token via backend (dev mode)
        const { token } = get();
        if (!token) {
          set({ ready: true, resolved: true, isAuthenticated: false, user: null });
          return;
        }
        try {
          const user = await authApi.getProfile();
          set({ user, isAuthenticated: true, ready: true, resolved: true });
        } catch {
          set({ token: null, user: null, isAuthenticated: false, ready: true, resolved: true });
        }
      },

      setToken: (token: string) => {
        set({ token });
      },
    }),
    {
      name: 'rheoson-auth',
      partialize: (state) => ({ token: state.token, hintSignedIn: state.hintSignedIn }),
    }
  )
);
