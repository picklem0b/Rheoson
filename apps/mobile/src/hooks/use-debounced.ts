import { useEffect, useState } from 'react';

/**
 * A value that settles after typing stops.
 *
 * Search fires on every keystroke otherwise, which on a phone means a request
 * per letter over a link that is often slow. 300ms is short enough to feel
 * immediate and long enough that a typed word is one request.
 */
export function useDebounced<T>(value: T, delay = 300): T {
	const [settled, setSettled] = useState(value);

	useEffect(() => {
		const timer = setTimeout(() => setSettled(value), delay);
		return () => clearTimeout(timer);
	}, [value, delay]);

	return settled;
}
