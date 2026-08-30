import { api } from './client.api';

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  display_name?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export const authApi = {
  login: async (data: LoginPayload): Promise<AuthResponse> => {
    return api.post<AuthResponse>('/api/auth/login', data);
  },

  register: async (data: RegisterPayload): Promise<AuthResponse> => {
    return api.post<AuthResponse>('/api/auth/register', data);
  },

  getProfile: async (): Promise<AuthUser> => {
    return api.get<AuthUser>('/api/auth/me');
  },

  updateProfile: async (data: { display_name?: string }): Promise<void> => {
    return api.patch('/api/auth/me', data);
  },
};
