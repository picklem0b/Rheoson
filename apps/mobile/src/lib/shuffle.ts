/**
 * A shuffled copy.
 *
 * Lives outside the queue store because two callers need it — the queue when
 * shuffle is turned on, and "Shuffle" buttons that start a list in a random
 * order — and a third copy of Fisher–Yates would eventually drift.
 */
export function shuffledCopy<T>(items: readonly T[]): T[] {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		const a = copy[i];
		const b = copy[j];
		if (a !== undefined && b !== undefined) {
			copy[i] = b;
			copy[j] = a;
		}
	}
	return copy;
}
