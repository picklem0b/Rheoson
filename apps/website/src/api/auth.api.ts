import { api } from './client.api';

export interface AuthUser {
  id: string;
  email: string;
  /** The account's single identity — there is no first/last name. */
  username: string;
  image_url?: string;
  created_at?: string;
}

// Sign-in and registration are handled by Clerk's hosted components, which
// verify the credential before any session exists. There is intentionally no
// client-side call that trades an email address for a session token.

export const authApi = {
  getProfile: async (): Promise<AuthUser> => {
    return api.get<AuthUser>('/auth/me');
  },

  updateProfile: async (data: { username?: string }): Promise<void> => {
    return api.patch('/auth/me', data);
  },

  logout: async (): Promise<void> => {
    return api.post('/auth/logout');
  },
};
