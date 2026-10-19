/**
 * Bytes and track count for everything saved on the device.
 *
 * Kept out of the offline store so the arithmetic can be tested without the
 * native filesystem module, which a Node test runner cannot load.
 */
export function savedSummary(saved: Record<string, number>): { count: number; bytes: number } {
	const values = Object.values(saved);
	return {
		count: values.length,
		bytes: values.reduce((sum, bytes) => sum + bytes, 0)
	};
}
