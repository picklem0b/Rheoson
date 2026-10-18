/**
 * Crash reporting.
 *
 * Something in this app crashing at 2am is worth nothing unless it survives the
 * device. Reports are queued locally first and posted to the server's
 * unauthenticated ingest route, which is the same endpoint the website uses,
 * so both clients' failures land in one list (Settings → Diagnostics → Crash
 * reports, on the web).
 *
 * Deliberately dependency-free: a crash reporter that can itself throw is worse
 * than none, so every path here is wrapped and the queue is capped.
 */
import { API_BASE } from '@/constants/config';
import { readJson, writeJson } from '@/lib/storage';

const QUEUE_KEY = 'rheoson.crash.queue';
const MAX_QUEUED = 20;

export interface CrashReport {
	id: string;
	message: string;
	stack?: string;
	kind: 'js' | 'render' | 'native';
	platform: string;
	appVersion: string;
	at: string;
}

function fingerprint(report: CrashReport): string {
	const source = `${report.kind}:${report.message}:${(report.stack ?? '').slice(0, 200)}`;
	let hash = 0;
	for (let i = 0; i < source.length; i += 1) hash = (hash * 31 + source.charCodeAt(i)) | 0;
	return Math.abs(hash).toString(36);
}

/**
 * Record a failure.
 *
 * Identical failures collapse into one queued report — a render loop can throw
 * the same error sixty times a second, and sixty identical reports help nobody.
 */
export async function captureCrash(
	error: unknown,
	kind: CrashReport['kind'] = 'js'
): Promise<void> {
	try {
		const err = error instanceof Error ? error : new Error(String(error));
		const report: CrashReport = {
			id: fingerprint({ message: err.message, stack: err.stack, kind } as CrashReport),
			message: err.message || 'Unknown error',
			stack: err.stack,
			kind,
			platform: 'android',
			appVersion: '2.25.0',
			at: new Date().toISOString()
		};

		const queue = (await readJson<CrashReport[]>(QUEUE_KEY)) ?? [];
		if (queue.some(item => item.id === report.id)) return;
		await writeJson(QUEUE_KEY, [...queue, report].slice(-MAX_QUEUED));
		void flushCrashes();
	} catch {
		/* reporting must never be the second failure */
	}
}

/** Send whatever is queued. Safe to call often; failures stay queued. */
export async function flushCrashes(): Promise<void> {
	try {
		const queue = (await readJson<CrashReport[]>(QUEUE_KEY)) ?? [];
		if (queue.length === 0) return;

		const remaining: CrashReport[] = [];
		for (const report of queue) {
			try {
				const res = await fetch(`${API_BASE}/diagnostics/crash`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(report)
				});
				if (!res.ok) remaining.push(report);
			} catch {
				remaining.push(report);
			}
		}
		await writeJson(QUEUE_KEY, remaining);
	} catch {
		/* same contract as capture */
	}
}
