import { useQuery } from '@tanstack/react-query';

import { healthApi } from '@/api/health.api';
import { qk } from '@/lib/queryKeys';

/**
 * The server, as seen from this phone.
 *
 * Settings shows it because the useful question on a self-hosted app is not
 * "is the app working" — it plainly is, you are looking at it — but "is the
 * server it talks to awake, and is it the version I think it is". A failed
 * probe is a normal answer here, not an error: the row renders the failure
 * instead of hiding the section.
 */
export function useServerHealth() {
	return useQuery({
		queryKey: qk.health(),
		queryFn: healthApi.check,
		retry: 0,
		staleTime: 30_000
	});
}
