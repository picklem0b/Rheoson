import { client } from './client.api';

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
    const res = await client.post<AuthResponse>('/api/auth/login', data);
    return res.data;
  },

  register: async (data: RegisterPayload): Promise<AuthResponse> => {
    const res = await client.post<AuthResponse>('/api/auth/register', data);
    return res.data;
  },

  getProfile: async (): Promise<AuthUser> => {
    const res = await client.get<AuthUser>('/api/auth/me');
    return res.data;
  },

  updateProfile: async (data: { display_name?: string }): Promise<void> => {
    await client.patch('/api/auth/me', data);
  },
};
