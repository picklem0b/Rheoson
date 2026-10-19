import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * The mobile app's tests run in Node.
 *
 * They cover the parts that are decisions rather than pixels — the queue's
 * transitions, the shuffle helper, the offline size arithmetic — because those
 * are the pieces a screen renders and a native build cannot check.
 */
export default defineConfig({
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url))
		}
	},
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts']
	}
});
