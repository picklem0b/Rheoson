/**
 * Turning a failure into a sentence a person can act on.
 *
 * The API client already produces precise messages ("Cannot reach the API at
 * …", "Library is empty"), so this only fills the gaps where a failure arrives
 * as something generic — a rejected fetch, a timeout — and adds the one piece
 * of context the message itself does not carry: whether the device is offline.
 */
import type { ApiError } from '@/api/client';

export function humanError(err: unknown, fallback = 'Something went wrong'): string {
	const error = err as Partial<ApiError>;
	if (typeof error?.detail === 'string' && error.detail) return error.detail;
	if (err instanceof Error && err.message) return err.message;
	return fallback;
}

/** Machine-readable code, when the backend sent one. */
export function errorCode(err: unknown): string | undefined {
	return (err as Partial<ApiError>)?.code;
}

/** True when the failure is a connectivity problem rather than a server bug. */
export function isOfflineError(err: unknown): boolean {
	const error = err as Partial<ApiError>;
	if (error?.status === 0) return true;
	return typeof navigator !== 'undefined' && navigator.onLine === false;
}
