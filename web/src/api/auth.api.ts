import { api } from './client.api';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  created_at?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  name?: string;
}

export interface AuthResponse {
  session_token: string;
  user: AuthUser;
}

export interface VisitorCount {
  guests: number;
  authed: number;
  total: number;
}

export const authApi = {
  login: async (data: LoginPayload): Promise<AuthResponse> => {
    return api.post<AuthResponse>('/auth/login', data);
  },

  register: async (data: RegisterPayload): Promise<AuthResponse> => {
    return api.post<AuthResponse>('/auth/register', data);
  },

  getProfile: async (): Promise<AuthUser> => {
    return api.get<AuthUser>('/auth/me');
  },

  updateProfile: async (data: { name?: string }): Promise<void> => {
    return api.patch('/auth/me', data);
  },

  recordGuestVisit: async (): Promise<{ ok: boolean }> => {
    return api.post('/auth/guest-visit');
  },

  getVisitorCount: async (): Promise<VisitorCount> => {
    return api.get<VisitorCount>('/auth/visitor-count');
  },
};
