import { useState, useEffect } from 'react';
import { Key, Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/client.api';
import { useSpotifyCredentials } from '@/hooks/spotifyCredentials.hook';
import {
	SettingsGroup,
	SettingsRow,
	StatusBadge
} from '../components/SettingsPrimitives';

export default function AccountSection() {
	const { clientId, clientSecret, hasCredentials, save, clear } =
		useSpotifyCredentials();

	const [editId, setEditId] = useState(clientId);
	const [editSecret, setEditSecret] = useState(clientSecret);
	const [showSecret, setShowSecret] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [serverState, setServerState] = useState<{
		connected: boolean;
		clientId: string;
	} | null>(null);

	useEffect(() => {
		api.get<{ connected: boolean; clientId: string }>(
			'/settings/spotify/status'
		)
			.then(setServerState)
			.catch(() => {});
	}, [saved]);

	const handleSave = async () => {
		if (!editId.trim() || !editSecret.trim()) return;
		setSaving(true);
		try {
			await api.post('/settings/spotify', {
				clientId: editId.trim(),
				clientSecret: editSecret.trim()
			});
			save(editId.trim(), editSecret.trim());
			setSaved(true);
			setTimeout(() => setSaved(false), 2500);
		} catch {
		} finally {
			setSaving(false);
		}
	};

	const handleClear = () => {
		clear();
		setEditId('');
		setEditSecret('');
		setServerState(null);
	};

	return (
		<div className='pb-2'>
			{/* Profile card */}
			<div className='mb-6 rounded-3xl overflow-hidden bg-gradient-to-br from-[var(--accent)]/20 via-[var(--bg-surface)] to-[var(--bg-surface)] border border-[var(--border)]'>
				<div className='px-5 py-5 flex items-center gap-4'>
					<div className='w-[64px] h-[64px] rounded-3xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center text-2xl font-black text-white shadow-lg flex-shrink-0'>
						L
					</div>
					<div className='min-w-0'>
						<p className='font-black text-[var(--text-primary)] text-lg tracking-tight leading-tight'>
							LethaboK
						</p>
						<p className='text-sm text-[var(--text-muted)]'>
							picklem0b
						</p>
						<div className='flex items-center gap-1.5 mt-1.5'>
							<div className='w-1.5 h-1.5 rounded-full bg-green-400' />
							<span className='text-xs text-green-400 font-semibold'>
								Self-hosted · Local
							</span>
						</div>
					</div>
				</div>
			</div>

			{/* Spotify credentials */}
			<SettingsGroup title='Spotify credentials'>
				<div className='px-4 py-4 space-y-4'>
					<StatusBadge
						ok={serverState?.connected ?? hasCredentials}
						labelOk={`Connected · ${serverState?.clientId ?? clientId.slice(0, 8)}…`}
						labelErr='Not connected — add credentials below'
					/>

					{/* Inputs */}
					{[
						{
							label: 'Client ID',
							value: editId,
							set: setEditId,
							placeholder: 'c6081b467a154fd69ba432261b973cd5',
							secret: false
						},
						{
							label: 'Client Secret',
							value: editSecret,
							set: setEditSecret,
							placeholder: '82ec996a6dba4218965bfea6483bd9c5',
							secret: true
						}
					].map(({ label, value, set, placeholder, secret }) => (
						<div key={label} className='space-y-1.5'>
							<label className='text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]'>
								{label}
							</label>
							<div className='relative'>
								<input
									type={
										secret && !showSecret
											? 'password'
											: 'text'
									}
									value={value}
									onChange={e => set(e.target.value)}
									placeholder={placeholder}
									className='w-full h-11 px-3 pr-14 text-sm rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] transition-colors font-mono'
								/>
								{secret && (
									<button
										onClick={() =>
											setShowSecret(!showSecret)
										}
										className='absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors px-1'
									>
										{showSecret ? 'hide' : 'show'}
									</button>
								)}
							</div>
						</div>
					))}

					<div className='flex gap-2 pt-1'>
						<Button
							variant='primary'
							size='sm'
							loading={saving}
							onClick={handleSave}
							className='flex-1'
						>
							{saved ? (
								<>
									<Check className='w-3.5 h-3.5' /> Saved
								</>
							) : (
								'Save credentials'
							)}
						</Button>
						{hasCredentials && (
							<Button
								variant='danger'
								size='sm'
								onClick={handleClear}
							>
								Disconnect
							</Button>
						)}
					</div>

					<p className='text-xs text-[var(--text-muted)] leading-relaxed'>
						Get credentials at{' '}
						<a
							href='https://developer.spotify.com/dashboard'
							target='_blank'
							rel='noopener noreferrer'
							className='text-[var(--accent)] underline underline-offset-2'
						>
							developer.spotify.com/dashboard
						</a>
						. Stored locally — Shulker never streams from Spotify.
					</p>
				</div>
			</SettingsGroup>

			<SettingsGroup title='Danger zone'>
				<SettingsRow
					label='Clear all app data'
					description='Wipes settings, playlists, history. Cannot be undone.'
					danger
					onClick={() => {
						localStorage.clear();
						window.location.reload();
					}}
				>
					<Trash2 className='w-4 h-4 text-red-400' />
				</SettingsRow>
			</SettingsGroup>
		</div>
	);
}
