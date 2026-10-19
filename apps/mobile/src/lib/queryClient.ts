import { QueryClient } from '@tanstack/react-query';

/**
 * The app's single query cache.
 *
 * It lives in a module rather than in the root component because two things
 * need it and only one of them can call `useQueryClient()`: the provider hands
 * it down to every screen, while `useOfflineMirror` runs *in* the root layout —
 * above its own provider — so the hook would throw "No QueryClient set" if it
 * asked the context for it.
 */
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			// A phone changes networks constantly; retrying a dead request three
			// times costs battery and shows nothing.
			retry: 1,
			staleTime: 30_000,
			refetchOnWindowFocus: false
		}
	}
});
