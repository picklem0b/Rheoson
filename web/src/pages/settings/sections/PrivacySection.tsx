import { ExternalLink, Trash2 } from 'lucide-react';
import { usePersisted } from '@/hooks/usePersisted';
import {
	SettingsGroup,
	SettingsRow,
	Toggle
} from '../components/SettingsPrimitives';

const GITHUB = 'https://github.com/picklem0b/shulker/blob/main/docs';

export default function PrivacySection() {
	const [history, setHistory] = usePersisted('save-history', true);
	const [searchLog, setSearchLog] = usePersisted('save-search-log', true);
	const [analytics, setAnalytics] = usePersisted('analytics', false);

	return (
		<div className='pb-2'>
			<SettingsGroup title='History'>
				<SettingsRow
					label='Save play history'
					description='Track recently played songs across sessions'
				>
					<Toggle value={history} onChange={setHistory} />
				</SettingsRow>
				<SettingsRow
					label='Save search history'
					description='Restore last search when you return to the search page'
				>
					<Toggle value={searchLog} onChange={setSearchLog} />
				</SettingsRow>
				<SettingsRow
					label='Clear play history'
					danger
					onClick={async () => {
						try {
							await fetch('/api/tracks/history', {
								method: 'DELETE'
							});
						} catch {}
					}}
				>
					<Trash2 className='w-4 h-4 text-red-400' />
				</SettingsRow>
				<SettingsRow
					label='Clear search history'
					danger
					onClick={() =>
						sessionStorage.removeItem('shulker-last-search')
					}
				>
					<Trash2 className='w-4 h-4 text-red-400' />
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup title='Data'>
				<SettingsRow
					label='Anonymous analytics'
					description='Help improve Shulker by sharing anonymous usage data. No personal data collected.'
				>
					<Toggle value={analytics} onChange={setAnalytics} />
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup title='Legal'>
				<SettingsRow
					label='Terms of service'
					onClick={() => window.open(`${GITHUB}/TERMS.md`, '_blank')}
				>
					<ExternalLink className='w-4 h-4 text-[var(--text-muted)]' />
				</SettingsRow>
				<SettingsRow
					label='Privacy policy'
					onClick={() =>
						window.open(`${GITHUB}/PRIVACY.md`, '_blank')
					}
				>
					<ExternalLink className='w-4 h-4 text-[var(--text-muted)]' />
				</SettingsRow>
				<SettingsRow
					label='Open source licences'
					onClick={() =>
						window.open(
							'https://github.com/picklem0b/shulker/blob/main/LICENSE',
							'_blank'
						)
					}
				>
					<ExternalLink className='w-4 h-4 text-[var(--text-muted)]' />
				</SettingsRow>
			</SettingsGroup>
		</div>
	);
}
