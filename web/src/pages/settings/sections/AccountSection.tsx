import React, { useState } from 'react';
import { Key, Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SettingsGroup, SettingsRow } from '../components/SettingsPrimitives';
import { cn } from '@/lib/utils';
import { json } from 'react-router-dom';

const SP_ID_KEY = 'shulker-spotify-client-id';
const SP_SECRET_KEY = 'shulker-spotify-client-secret';

function useSpotifyCredentials() {
	const [clientId, setClientId] = useState(
		() => localStorage.getItem(SP_ID_KEY) || ''
	);
	const [clientSecret, setClientSecret] = useState(
		() => localStorage.getItem(SP_SECRET_KEY) || ''
	);
	const hasCredentials = Boolean(clientId && clientSecret);

	const save = (id: string, secret: string) => {
		localStorage.setItem(SP_ID_KEY, id);
		localStorage.setItem(SP_SECRET_KEY, secret);
		setClientId(id);
		setClientSecret(secret);
		fetch('/api/settings/spotify', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ clientId: id, clientSecret: secret })
		}).catch(() => {});
	};

	const clear = () => {
		localStorage.removeItem(SP_ID_KEY);
		localStorage.removeItem(SP_SECRET_KEY);
		setClientId('');
		setClientSecret('');
	};

	return { clientId, clientSecret, hasCredentials, save, clear };
}

export default function AccountSection() {
	const { clientId, clientSecret, hasCredentials, save, clear } =
		useSpotifyCredentials();
	const [editId, setEditId] = useState(clientId);
	const [editSecret, setEditSecret] = useState(clientSecret);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [showSecret, setShowSecret] = useState(false);

	const handleSave = async () => {
		if (!editId.trim() || !editSecret.trim()) return;
		setSaving(true);
		save(editId.trim(), editSecret.trim());
		await new Promise(r => setTimeout(r, 600));
		setSaving(false);
		setSaved(true);
		setTimeout(() => setSaved(false), 2500);
	};

	return (
		<div className='pb-2'>
			{/* Profile hero */}
			<div className='mb-5 rounded-3xl overflow-hidden bg-gradient-to-br from-[var(--accent)]/20 via-[var(--bg-surface)] to-[var(--bg-surface)] border border-[var(--border)]'>
				<div className='px-5 py-6 flex items-center gap-4'>
					<div className='w-[72px] h-[72px] rounded-3xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center text-3xl font-black text-white shadow-xl'>
						L
					</div>
					<div>
						<p className='font-black text-[var(--text-primary)] text-xl tracking-tight'>
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
				<div className='border-t border-[var(--border)] divide-y divide-[var(--border)]'>
					<SettingsRow label='Edit display name' onClick={() => {}} />
					<SettingsRow label='Change avatar' onClick={() => {}} />
				</div>
			</div>

			<SettingsGroup title='Spotify credentials'>
				<div className='px-4 py-4 space-y-3'>
					<div
						className={cn(
							'flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-semibold',
							hasCredentials
								? 'bg-green-500/10 text-green-400 border border-green-500/20'
								: 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
						)}
					>
						<Key className='w-3.5 h-3.5' />
						{hasCredentials
							? '✓ Spotify connected — metadata, artwork and link resolution unlocked'
							: '⚠ No credentials — add your Spotify Client ID and Secret below'}
					</div>

					{(['Client ID', 'Client Secret'] as const).map(
						(label, i) => (
							<div key={label} className='space-y-1.5'>
								<label className='text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider'>
									{label}
								</label>
								<div className='relative'>
									<input
										type={
											i === 1 && !showSecret
												? 'password'
												: 'text'
										}
										value={i === 0 ? editId : editSecret}
										onChange={e =>
											i === 0
												? setEditId(e.target.value)
												: setEditSecret(e.target.value)
										}
										placeholder={
											i === 0
												? 'c6081b467a154fd69ba432261b973cd5'
												: '82ec996a6dba4218965bfea6483bd9c5'
										}
										className='w-full h-10 px-3 pr-12 text-sm rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] font-mono'
									/>
									{i === 1 && (
										<button
											onClick={() =>
												setShowSecret(!showSecret)
											}
											className='absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]'
										>
											{showSecret ? 'hide' : 'show'}
										</button>
									)}
								</div>
							</div>
						)
					)}

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
									<Check className='w-4 h-4' /> Saved
								</>
							) : (
								'Save credentials'
							)}
						</Button>
						{hasCredentials && (
							<Button variant='danger' size='sm' onClick={clear}>
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
							className='text-[var(--accent)] underline'
						>
							developer.spotify.com/dashboard
						</a>
						. Stored locally only — Shulker never streams from
						Spotify.
					</p>
				</div>
			</SettingsGroup>

			<SettingsGroup title='Danger zone'>
				<SettingsRow
					label='Clear all app data'
					description='Wipes all settings, playlists, history. Cannot be undone.'
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
