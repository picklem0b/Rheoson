import { api } from './client';

export interface HealthPayload {
	status: string;
	version?: string;
	services?: Record<string, string | boolean>;
	uptime?: number;
}

/** Liveness and version — the Doctor screen's raw material. */
export const healthApi = {
	check: () => api.get<HealthPayload>('/health'),
	version: () => api.get<{ version: string }>('/version'),
	diagnostics: () => api.get<Record<string, unknown>>('/health/diag'),
	selftest: () => api.get<Record<string, unknown>>('/health/selftest')
};
