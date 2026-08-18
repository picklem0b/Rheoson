import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
	FolderOpen,
	RefreshCw,
	Download,
	Trash2,
	CheckCircle
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api } from '@/api/client.api';
import { usePersisted } from '@/hooks/persisted.hook';
import {
	SettingsGroup,
	SettingsRow,
	Toggle
} from '../components/SettingsPrimitives';

const DEFAULT_DIRS = [
	{ path: '/data/data/com.termux/files/home/shulker/music', active: true },
	{ path: '/storage/emulated/0/Music', active: true },
	{ path: '/storage/emulated/0/Download', active: false },
	{ path: '/storage/music', active: true }
];

export default function StorageSection() {
	const [dirs, setDirs] = usePersisted('music-dirs', DEFAULT_DIRS);
	const [customDir, setCustomDir] = useState('');
	const [adding, setAdding] = useState(false);
	const [rescanning, setRescanning] = useState(false);
	const [rescanned, setRescanned] = useState(false);
	const [exporting, setExporting] = useState(false);
	const [clearing, setClearing] = useState<string | null>(null);

	const addDir = () => {
		const trimmed = customDir.trim();
		if (!trimmed) return;
		setDirs([...dirs, { path: trimmed, active: true }]);
		setCustomDir('');
		setAdding(false);
	};

	const removeDir = (path: string) => {
		setDirs(dirs.filter(d => d.path !== path));
	};

	const rescan = async () => {
		setRescanning(true);
		try {
			await api.post('/library/rescan');
			setRescanned(true);
			setTimeout(() => setRescanned(false), 3000);
		} catch {
		} finally {
			setRescanning(false);
		}
	};

	const exportLibrary = async () => {
		setExporting(true);
		try {
			const data = await api.get<unknown>('/tracks');
			const blob = new Blob([JSON.stringify(data, null, 2)], {
				type: 'application/json'
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `shulker-library-${new Date().toISOString().slice(0, 10)}.json`;
			a.click();
			URL.revokeObjectURL(url);
		} catch {
		} finally {
			setExporting(false);
		}
	};

	const clearStreamCache = async () => {
		setClearing('stream');
		try {
			await api.post('/stream/cache/clear');
		} catch {}
		setClearing(null);
	};

	const clearArtworkCache = async () => {
		setClearing('artwork');
		try {
			await api.post('/stream/artwork/cache/clear');
		} catch {}
		setClearing(null);
	};

	return (
		<div className='pb-2'>
			<SettingsGroup title='Music directories'>
				{dirs.map((d, i) => (
					<div
						key={d.path}
						className='flex items-center justify-between gap-3 px-4 py-3.5 border-b border-[var(--border)] last:border-0'
					>
						<div className='min-w-0 flex-1'>
							<p className='text-sm font-semibold text-[var(--text-primary)] truncate leading-snug'>
								{d.path.split('/').pop() || d.path}
							</p>
							<p className='text-xs text-[var(--text-muted)] truncate mt-0.5 font-mono'>
								{d.path}
							</p>
						</div>
						<div className='flex items-center gap-2 flex-shrink-0'>
							<Toggle
								value={d.active}
								onChange={v =>
									setDirs(
										dirs.map((x, j) =>
											j === i ? { ...x, active: v } : x
										)
									)
								}
							/>
							<button
								onClick={() => removeDir(d.path)}
								className='w-7 h-7 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-red-400 hover:bg-red-400/10 transition-colors'
							>
								<Trash2 className='w-3.5 h-3.5' />
							</button>
						</div>
					</div>
				))}

				<AnimatePresence>
					{adding && (
						<motion.div
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: 'auto', opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							className='overflow-hidden border-b border-[var(--border)]'
						>
							<div className='px-4 py-3 flex gap-2'>
								<input
									autoFocus
									value={customDir}
									onChange={e => setCustomDir(e.target.value)}
									onKeyDown={e =>
										e.key === 'Enter' && addDir()
									}
									placeholder='/storage/emulated/0/Music'
									className='flex-1 h-9 px-3 text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] transition-colors font-mono'
								/>
								<Button
									size='sm'
									variant='primary'
									onClick={addDir}
								>
									Add
								</Button>
								<Button
									size='sm'
									variant='ghost'
									onClick={() => setAdding(false)}
								>
									Cancel
								</Button>
							</div>
						</motion.div>
					)}
				</AnimatePresence>

				<SettingsRow
					label='Add directory'
					description='Scan a new folder for music files'
					onClick={() => setAdding(!adding)}
				>
					<FolderOpen className='w-4 h-4 text-[var(--accent)]' />
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup title='Library'>
				<SettingsRow
					label={rescanned ? 'Library rescanned' : 'Rescan library'}
					description='Re-index all active music directories'
					onClick={rescanning ? undefined : rescan}
					loading={rescanning}
				>
					{rescanned ? (
						<CheckCircle className='w-4 h-4 text-green-400' />
					) : (
						<RefreshCw
							className={
								rescanning
									? 'w-4 h-4 text-[var(--accent)] animate-spin'
									: 'w-4 h-4 text-[var(--text-muted)]'
							}
						/>
					)}
				</SettingsRow>
				<SettingsRow
					label='Export library'
					description='Save your full track library as JSON'
					onClick={exporting ? undefined : exportLibrary}
					loading={exporting}
				>
					<Download className='w-4 h-4 text-[var(--text-muted)]' />
				</SettingsRow>
			</SettingsGroup>

			<SettingsGroup title='Cache'>
				<SettingsRow
					label='Clear stream cache'
					description='Removes buffered audio segments'
					danger
					onClick={
						clearing === 'stream' ? undefined : clearStreamCache
					}
					loading={clearing === 'stream'}
				>
					<Trash2 className='w-4 h-4 text-red-400' />
				</SettingsRow>
				<SettingsRow
					label='Clear artwork cache'
					description='Re-fetches album art on next play'
					danger
					onClick={
						clearing === 'artwork' ? undefined : clearArtworkCache
					}
					loading={clearing === 'artwork'}
				>
					<Trash2 className='w-4 h-4 text-red-400' />
				</SettingsRow>
			</SettingsGroup>
		</div>
	);
}
